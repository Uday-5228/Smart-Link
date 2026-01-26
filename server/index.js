import express from 'express'
import cors from 'cors'
import pg from 'pg'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { fileURLToPath } from 'url'
import QRCode from 'qrcode'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const { Pool } = pg

// Initializing Express
const app = express()

// CORS configuration for production
const corsOptions = {
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}
app.use(cors(corsOptions))
app.use(express.json())

// Initializing PostgreSQL connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
})

// Creating tables
const initDB = async () => {
    const client = await pool.connect()
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS hubs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id),
                slug TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                description TEXT,
                theme TEXT DEFAULT 'default',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS links (
                id TEXT PRIMARY KEY,
                hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                icon TEXT DEFAULT '🔗',
                position INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS rules (
                id TEXT PRIMARY KEY,
                link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
                rule_type TEXT NOT NULL,
                rule_config TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS analytics (
                id TEXT PRIMARY KEY,
                hub_id TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
                link_id TEXT,
                event_type TEXT NOT NULL,
                device_type TEXT,
                location TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `)
        console.log('Database tables initialized')
    } finally {
        client.release()
    }
}

// Initializing database on startup
initDB().catch(err => console.error('Database init error:', err))

// Password hashing
const hashPassword = (password) => {
    return Buffer.from(password).toString('base64')
}

const verifyPassword = (password, hash) => {
    return hashPassword(password) === hash
}

// Authentication middleware
const authenticate = async (req, res, next) => {
    const userId = req.headers.authorization?.replace('Bearer ', '') || req.query.authorization
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' })
    }
    try {
        const result = await pool.query('SELECT * FROM users WHERE id = $1', [userId])
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Unauthorized' })
        }
        req.user = result.rows[0]
        next()
    } catch (error) {
        res.status(500).json({ error: 'Database error' })
    }
}

// Authentication Routes

app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' })
    }

    try {
        const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email])
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' })
        }

        const id = uuidv4()
        const hashedPassword = hashPassword(password)

        await pool.query(
            'INSERT INTO users (id, email, password, name) VALUES ($1, $2, $3, $4)',
            [id, email, hashedPassword, name || null]
        )

        res.json({
            user: { id, email, name }
        })
    } catch (error) {
        console.error('Register error:', error)
        res.status(500).json({ error: 'Registration failed' })
    }
})

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' })
    }

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email])
        const user = result.rows[0]

        if (!user || !verifyPassword(password, user.password)) {
            return res.status(401).json({ error: 'Invalid email or password' })
        }

        res.json({
            user: { id: user.id, email: user.email, name: user.name }
        })
    } catch (error) {
        console.error('Login error:', error)
        res.status(500).json({ error: 'Login failed' })
    }
})

// Hub Routes

app.get('/api/hubs', authenticate, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT h.*, 
                   COUNT(DISTINCT l.id) as "linkCount",
                   (SELECT COUNT(*) FROM analytics WHERE hub_id = h.id AND event_type = 'click') as "clickCount"
            FROM hubs h
            LEFT JOIN links l ON l.hub_id = h.id
            WHERE h.user_id = $1
            GROUP BY h.id
            ORDER BY h.created_at DESC
        `, [req.user.id])

        const hubs = result.rows
        const totalClicks = hubs.reduce((sum, h) => sum + parseInt(h.clickCount || 0), 0)
        const totalLinks = hubs.reduce((sum, h) => sum + parseInt(h.linkCount || 0), 0)

        res.json({ hubs, totalClicks, totalLinks })
    } catch (error) {
        console.error('Get hubs error:', error)
        res.status(500).json({ error: 'Failed to get hubs' })
    }
})

app.post('/api/hubs', authenticate, async (req, res) => {
    const { title, slug, description, theme, links } = req.body

    if (!title || !slug) {
        return res.status(400).json({ error: 'Title and slug are required' })
    }

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        const existing = await client.query('SELECT id FROM hubs WHERE slug = $1', [slug])
        if (existing.rows.length > 0) {
            await client.query('ROLLBACK')
            return res.status(400).json({ error: 'Slug already taken' })
        }

        const hubId = uuidv4()

        await client.query(
            'INSERT INTO hubs (id, user_id, slug, title, description, theme) VALUES ($1, $2, $3, $4, $5, $6)',
            [hubId, req.user.id, slug, title, description || null, theme || 'default']
        )

        // Inserting links
        if (links && links.length > 0) {
            for (const link of links) {
                const linkId = uuidv4()
                await client.query(
                    'INSERT INTO links (id, hub_id, title, url, icon, position, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [linkId, hubId, link.title, link.url, link.icon || '🔗', link.position ?? 0, link.isActive !== false]
                )

                // Inserting rules for the link
                if (link.rules && link.rules.length > 0) {
                    for (const rule of link.rules) {
                        await client.query(
                            'INSERT INTO rules (id, link_id, rule_type, rule_config) VALUES ($1, $2, $3, $4)',
                            [uuidv4(), linkId, rule.type, JSON.stringify(rule.config)]
                        )
                    }
                }
            }
        }

        await client.query('COMMIT')
        res.json({ hub: { id: hubId, slug, title, description, theme } })
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Create hub error:', error)
        res.status(500).json({ error: 'Failed to create hub' })
    } finally {
        client.release()
    }
})

app.get('/api/hubs/:id', authenticate, async (req, res) => {
    try {
        const hubResult = await pool.query(
            'SELECT * FROM hubs WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        )

        if (hubResult.rows.length === 0) {
            return res.status(404).json({ error: 'Hub not found' })
        }

        const hub = hubResult.rows[0]

        const linksResult = await pool.query(`
            SELECT l.*, 
                   COALESCE(
                       (SELECT json_agg(json_build_object('id', r.id, 'type', r.rule_type, 'config', r.rule_config))
                        FROM rules r WHERE r.link_id = l.id),
                       '[]'::json
                   ) as rules_json
            FROM links l
            WHERE l.hub_id = $1
            ORDER BY l.position ASC
        `, [hub.id])

        // Parsing rules using JSON
        const linksWithRules = linksResult.rows.map(link => ({
            ...link,
            isActive: link.is_active,
            rules: (link.rules_json || []).filter(r => r && r.id).map(r => ({
                ...r,
                config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config
            }))
        }))

        res.json({ hub, links: linksWithRules })
    } catch (error) {
        console.error('Get hub error:', error)
        res.status(500).json({ error: 'Failed to get hub' })
    }
})

app.put('/api/hubs/:id', authenticate, async (req, res) => {
    const { title, slug, description, theme, links } = req.body
    const hubId = req.params.id

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        const hubResult = await client.query(
            'SELECT * FROM hubs WHERE id = $1 AND user_id = $2',
            [hubId, req.user.id]
        )

        if (hubResult.rows.length === 0) {
            await client.query('ROLLBACK')
            return res.status(404).json({ error: 'Hub not found' })
        }

        const hub = hubResult.rows[0]

        // Checking slug uniqueness (excluding current hub)
        if (slug && slug !== hub.slug) {
            const existing = await client.query(
                'SELECT id FROM hubs WHERE slug = $1 AND id != $2',
                [slug, hubId]
            )
            if (existing.rows.length > 0) {
                await client.query('ROLLBACK')
                return res.status(400).json({ error: 'Slug already taken' })
            }
        }

        // Updating hub
        await client.query(
            'UPDATE hubs SET title = $1, slug = $2, description = $3, theme = $4 WHERE id = $5',
            [title, slug, description, theme, hubId]
        )

        // Updating links - delete existing and re-insert
        if (links) {
            await client.query('DELETE FROM links WHERE hub_id = $1', [hubId])

            for (const link of links) {
                const linkId = uuidv4()
                await client.query(
                    'INSERT INTO links (id, hub_id, title, url, icon, position, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [linkId, hubId, link.title, link.url, link.icon || '🔗', link.position ?? 0, link.isActive !== false]
                )

                if (link.rules && link.rules.length > 0) {
                    for (const rule of link.rules) {
                        await client.query(
                            'INSERT INTO rules (id, link_id, rule_type, rule_config) VALUES ($1, $2, $3, $4)',
                            [uuidv4(), linkId, rule.type, JSON.stringify(rule.config)]
                        )
                    }
                }
            }
        }

        await client.query('COMMIT')
        res.json({ hub: { id: hubId, slug, title, description, theme } })
    } catch (error) {
        await client.query('ROLLBACK')
        console.error('Update hub error:', error)
        res.status(500).json({ error: 'Failed to update hub' })
    } finally {
        client.release()
    }
})

app.delete('/api/hubs/:id', authenticate, async (req, res) => {
    try {
        const hubResult = await pool.query(
            'SELECT * FROM hubs WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        )

        if (hubResult.rows.length === 0) {
            return res.status(404).json({ error: 'Hub not found' })
        }

        await pool.query('DELETE FROM hubs WHERE id = $1', [req.params.id])
        res.json({ success: true })
    } catch (error) {
        console.error('Delete hub error:', error)
        res.status(500).json({ error: 'Failed to delete hub' })
    }
})

// Public Hub Route

app.get('/api/public/:slug', async (req, res) => {
    try {
        const hubResult = await pool.query('SELECT * FROM hubs WHERE slug = $1', [req.params.slug])

        if (hubResult.rows.length === 0) {
            return res.status(404).json({ error: 'Hub not found' })
        }

        const hub = hubResult.rows[0]

        const linksResult = await pool.query(`
            SELECT l.*, 
                   COALESCE(
                       (SELECT json_agg(json_build_object('type', r.rule_type, 'config', r.rule_config))
                        FROM rules r WHERE r.link_id = l.id),
                       '[]'::json
                   ) as rules_json
            FROM links l
            WHERE l.hub_id = $1 AND l.is_active = true
            ORDER BY l.position ASC
        `, [hub.id])

        // Parsing rules and filter based on context
        const deviceType = req.query.device || 'desktop'
        const currentHour = new Date().getHours()

        const filteredLinks = linksResult.rows.filter(link => {
            const rules = (link.rules_json || []).filter(r => r && r.type)

            // If no rules, always show
            if (rules.length === 0) return true

            // Checking each rule
            for (const rule of rules) {
                const config = typeof rule.config === 'string' ? JSON.parse(rule.config) : rule.config

                // Time based rule
                if (rule.type === 'time') {
                    const { startHour, endHour } = config
                    if (currentHour < startHour || currentHour >= endHour) {
                        return false
                    }
                }

                // Device based rule
                if (rule.type === 'device') {
                    const { devices } = config
                    if (devices && devices.length > 0 && !devices.includes(deviceType)) {
                        return false
                    }
                }
            }

            return true
        })

        res.json({
            hub: {
                title: hub.title,
                description: hub.description,
                theme: hub.theme,
                slug: hub.slug
            },
            links: filteredLinks.map(l => ({
                id: l.id,
                title: l.title,
                url: l.url,
                icon: l.icon
            }))
        })
    } catch (error) {
        console.error('Get public hub error:', error)
        res.status(500).json({ error: 'Failed to get hub' })
    }
})

// Analytics Rules

app.post('/api/analytics/track', async (req, res) => {
    const { slug, linkId, eventType, deviceType, timestamp } = req.body

    try {
        const hubResult = await pool.query('SELECT id FROM hubs WHERE slug = $1', [slug])
        if (hubResult.rows.length === 0) {
            return res.status(404).json({ error: 'Hub not found' })
        }

        await pool.query(
            'INSERT INTO analytics (id, hub_id, link_id, event_type, device_type, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
            [uuidv4(), hubResult.rows[0].id, linkId || null, eventType, deviceType, timestamp || new Date().toISOString()]
        )

        res.json({ success: true })
    } catch (error) {
        console.error('Track analytics error:', error)
        res.status(500).json({ error: 'Failed to track analytics' })
    }
})

app.get('/api/analytics/:hubId', authenticate, async (req, res) => {
    const hubId = req.params.hubId
    const range = req.query.range || '7d'

    try {
        // Verifying ownership
        const hubResult = await pool.query(
            'SELECT * FROM hubs WHERE id = $1 AND user_id = $2',
            [hubId, req.user.id]
        )

        if (hubResult.rows.length === 0) {
            return res.status(404).json({ error: 'Hub not found' })
        }

        // Calculating date filter
        let dateFilter = ''
        let dateFilterAnalytics = ''
        if (range === '24h') {
            dateFilter = "AND timestamp >= NOW() - INTERVAL '1 day'"
            dateFilterAnalytics = "AND a.timestamp >= NOW() - INTERVAL '1 day'"
        } else if (range === '7d') {
            dateFilter = "AND timestamp >= NOW() - INTERVAL '7 days'"
            dateFilterAnalytics = "AND a.timestamp >= NOW() - INTERVAL '7 days'"
        } else if (range === '30d') {
            dateFilter = "AND timestamp >= NOW() - INTERVAL '30 days'"
            dateFilterAnalytics = "AND a.timestamp >= NOW() - INTERVAL '30 days'"
        }

        // Total counts
        const viewsResult = await pool.query(`
            SELECT COUNT(*) as count FROM analytics 
            WHERE hub_id = $1 AND event_type = 'visit' ${dateFilter}
        `, [hubId])
        const totalViews = parseInt(viewsResult.rows[0]?.count || 0)

        const clicksResult = await pool.query(`
            SELECT COUNT(*) as count FROM analytics 
            WHERE hub_id = $1 AND event_type = 'click' ${dateFilter}
        `, [hubId])
        const totalClicks = parseInt(clicksResult.rows[0]?.count || 0)

        // Link statistics
        const linkStatsResult = await pool.query(`
            SELECT l.id, l.title, l.url, l.icon, COUNT(a.id) as clicks
            FROM links l
            LEFT JOIN analytics a ON a.link_id = l.id AND a.event_type = 'click' ${dateFilterAnalytics}
            WHERE l.hub_id = $1
            GROUP BY l.id
            ORDER BY clicks DESC
        `, [hubId])

        // Device breakdown
        const deviceResult = await pool.query(`
            SELECT device_type as type, COUNT(*) as count
            FROM analytics
            WHERE hub_id = $1 AND event_type = 'visit' ${dateFilter}
            GROUP BY device_type
            ORDER BY count DESC
        `, [hubId])

        // Daily statistics
        const dailyResult = await pool.query(`
            SELECT 
                DATE(timestamp) as date,
                SUM(CASE WHEN event_type = 'visit' THEN 1 ELSE 0 END) as views,
                SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) as clicks
            FROM analytics
            WHERE hub_id = $1 ${dateFilter}
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
            LIMIT 7
        `, [hubId])

        // Formating daily statistics with labels
        const formattedDailyStats = dailyResult.rows.reverse().map(d => ({
            ...d,
            views: parseInt(d.views),
            clicks: parseInt(d.clicks),
            label: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })
        }))

        res.json({
            totalViews,
            totalClicks,
            linkStats: linkStatsResult.rows.map(l => ({ ...l, clicks: parseInt(l.clicks) })),
            deviceBreakdown: deviceResult.rows.map(d => ({ ...d, count: parseInt(d.count) })),
            dailyStats: formattedDailyStats
        })
    } catch (error) {
        console.error('Get analytics error:', error)
        res.status(500).json({ error: 'Failed to get analytics' })
    }
})


// QR code generation

app.get('/api/hubs/:id/qr', authenticate, async (req, res) => {
    try {
        const hubResult = await pool.query(
            'SELECT * FROM hubs WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        )

        if (hubResult.rows.length === 0) {
            return res.status(404).json({ error: 'Hub not found' })
        }

        const hub = hubResult.rows[0]
        const format = req.query.format || 'png'
        const size = parseInt(req.query.size) || 300
        const publicUrl = `${req.protocol}://${req.get('host')}/h/${hub.slug}`

        if (format === 'svg') {
            const svg = await QRCode.toString(publicUrl, {
                type: 'svg',
                width: size,
                margin: 2,
                color: {
                    dark: '#00ff88',
                    light: '#000000'
                }
            })
            res.setHeader('Content-Type', 'image/svg+xml')
            res.send(svg)
        } else {
            const png = await QRCode.toDataURL(publicUrl, {
                width: size,
                margin: 2,
                color: {
                    dark: '#00ff88',
                    light: '#000000'
                }
            })
            res.json({ qrCode: png, url: publicUrl })
        }
    } catch (error) {
        console.error('QR code error:', error)
        res.status(500).json({ error: 'Failed to generate QR code' })
    }
})

// Analytics export


app.get('/api/analytics/:hubId/export', authenticate, async (req, res) => {
    const hubId = req.params.hubId
    const format = req.query.format || 'json'
    const range = req.query.range || 'all'

    try {
        // Verifying ownership
        const hubResult = await pool.query(
            'SELECT * FROM hubs WHERE id = $1 AND user_id = $2',
            [hubId, req.user.id]
        )

        if (hubResult.rows.length === 0) {
            return res.status(404).json({ error: 'Hub not found' })
        }

        const hub = hubResult.rows[0]

        // Calculating date filter
        let dateFilter = ''
        let dateFilterAnalytics = ''
        if (range === '24h') {
            dateFilter = "AND timestamp >= NOW() - INTERVAL '1 day'"
            dateFilterAnalytics = "AND a.timestamp >= NOW() - INTERVAL '1 day'"
        } else if (range === '7d') {
            dateFilter = "AND timestamp >= NOW() - INTERVAL '7 days'"
            dateFilterAnalytics = "AND a.timestamp >= NOW() - INTERVAL '7 days'"
        } else if (range === '30d') {
            dateFilter = "AND timestamp >= NOW() - INTERVAL '30 days'"
            dateFilterAnalytics = "AND a.timestamp >= NOW() - INTERVAL '30 days'"
        }

        // Getting all analytics data
        const analyticsResult = await pool.query(`
            SELECT 
                a.event_type,
                a.device_type,
                a.timestamp,
                l.title as link_title,
                l.url as link_url
            FROM analytics a
            LEFT JOIN links l ON l.id = a.link_id
            WHERE a.hub_id = $1 ${dateFilter}
            ORDER BY a.timestamp DESC
        `, [hubId])

        const analyticsData = analyticsResult.rows

        // Getting summary statistics
        const totalViews = analyticsData.filter(a => a.event_type === 'visit').length
        const totalClicks = analyticsData.filter(a => a.event_type === 'click').length

        // Getting link stats
        const linkStatsResult = await pool.query(`
            SELECT l.title, l.url, COUNT(a.id) as clicks
            FROM links l
            LEFT JOIN analytics a ON a.link_id = l.id AND a.event_type = 'click' ${dateFilterAnalytics}
            WHERE l.hub_id = $1
            GROUP BY l.id, l.title, l.url
            ORDER BY clicks DESC
        `, [hubId])

        if (format === 'csv') {
            // Generating CSV
            let csv = 'Smart Link Hub Analytics Report\n'
            csv += `Hub: ${hub.title}\n`
            csv += `Slug: ${hub.slug}\n`
            csv += `Generated: ${new Date().toISOString()}\n`
            csv += `Time Range: ${range}\n\n`

            csv += 'SUMMARY\n'
            csv += `Total Views,${totalViews}\n`
            csv += `Total Clicks,${totalClicks}\n`
            csv += `Click Rate,${totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : 0}%\n\n`

            csv += 'LINK PERFORMANCE\n'
            csv += 'Link Title,URL,Clicks\n'
            linkStatsResult.rows.forEach(link => {
                csv += `"${link.title}","${link.url}",${link.clicks}\n`
            })

            csv += '\nDETAILED EVENTS\n'
            csv += 'Timestamp,Event Type,Device,Link Title,Link URL\n'
            analyticsData.forEach(event => {
                csv += `${event.timestamp},${event.event_type},${event.device_type || 'unknown'},"${event.link_title || ''}","${event.link_url || ''}"\n`
            })

            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', `attachment; filename="${hub.slug}-analytics-${range}.csv"`)
            res.send(csv)
        } else {
            // Returning JSON
            res.json({
                hub: {
                    title: hub.title,
                    slug: hub.slug,
                    description: hub.description
                },
                timeRange: range,
                generatedAt: new Date().toISOString(),
                summary: {
                    totalViews,
                    totalClicks,
                    clickRate: totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : 0
                },
                linkPerformance: linkStatsResult.rows.map(l => ({ ...l, clicks: parseInt(l.clicks) })),
                events: analyticsData
            })
        }
    } catch (error) {
        console.error('Export analytics error:', error)
        res.status(500).json({ error: 'Failed to export analytics' })
    }
})

// Serving static files in production
if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '..', 'dist')

    // Serve static assets
    app.use(express.static(distPath))

    // Handling client side routing, serve index.html for non-API routes
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(distPath, 'index.html'))
        }
    })
}

// Starting server
const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
})

