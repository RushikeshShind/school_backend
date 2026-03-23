const db = require('../config/db');

const MODULES = ['inquiries', 'admissions'];

// GET /roles?college_id=X  — college ke roles fetch karo
exports.getRoles = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });

        const { college_id } = req.query;
        if (!college_id) return res.status(400).json({ message: 'college_id is required' });

        const [roles] = await db.query(
            'SELECT * FROM roles WHERE college_id = ? ORDER BY created_at DESC',
            [college_id]
        );

        const [permissions] = await db.query(
            'SELECT rp.* FROM role_permissions rp INNER JOIN roles r ON rp.role_id = r.id WHERE r.college_id = ?',
            [college_id]
        );

        // Safe: role_id column may not exist yet
        let countMap = {};
        try {
            const [userCounts] = await db.query(
                'SELECT ca.role_id, COUNT(*) as count FROM college_admins ca INNER JOIN roles r ON ca.role_id = r.id WHERE r.college_id = ? AND ca.role_id IS NOT NULL GROUP BY ca.role_id',
                [college_id]
            );
            userCounts.forEach(r => { countMap[r.role_id] = r.count; });
        } catch (_) { /* migration pending */ }

        const rolesWithPerms = roles.map(role => ({
            ...role,
            user_count: countMap[role.id] || 0,
            permissions: MODULES.map(mod => {
                const perm = permissions.find(p => p.role_id === role.id && p.module === mod);
                return {
                    module: mod,
                    can_view:   perm ? !!perm.can_view   : false,
                    can_create: perm ? !!perm.can_create : false,
                    can_edit:   perm ? !!perm.can_edit   : false,
                    can_delete: perm ? !!perm.can_delete : false,
                };
            })
        }));

        res.json({ success: true, data: rolesWithPerms });
    } catch (error) {
        console.error('getRoles error:', error.message);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

// POST /roles
exports.createRole = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });

        const { name, description, color, college_id, permissions } = req.body;
        if (!name)       return res.status(400).json({ message: 'Role name is required' });
        if (!college_id) return res.status(400).json({ message: 'college_id is required' });

        const [result] = await db.query(
            'INSERT INTO roles (college_id, name, description, color) VALUES (?, ?, ?, ?)',
            [college_id, name.trim(), description || null, color || '#1A6237']
        );
        const roleId = result.insertId;

        if (permissions && Array.isArray(permissions)) {
            for (const perm of permissions) {
                if (!MODULES.includes(perm.module)) continue;
                await db.query(
                    'INSERT INTO role_permissions (role_id, module, can_view, can_create, can_edit, can_delete) VALUES (?, ?, ?, ?, ?, ?)',
                    [roleId, perm.module, perm.can_view ? 1 : 0, perm.can_create ? 1 : 0, perm.can_edit ? 1 : 0, perm.can_delete ? 1 : 0]
                );
            }
        }

        res.json({ success: true, message: 'Role created', roleId });
    } catch (error) {
        console.error('createRole error:', error.message);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Role name already exists for this college' });
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

// PUT /roles/:id
exports.updateRole = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });

        const { id } = req.params;
        const { name, description, color, permissions } = req.body;
        if (!name) return res.status(400).json({ message: 'Role name is required' });

        await db.query(
            'UPDATE roles SET name = ?, description = ?, color = ? WHERE id = ?',
            [name.trim(), description || null, color || '#1A6237', id]
        );

        await db.query('DELETE FROM role_permissions WHERE role_id = ?', [id]);
        if (permissions && Array.isArray(permissions)) {
            for (const perm of permissions) {
                if (!MODULES.includes(perm.module)) continue;
                await db.query(
                    'INSERT INTO role_permissions (role_id, module, can_view, can_create, can_edit, can_delete) VALUES (?, ?, ?, ?, ?, ?)',
                    [id, perm.module, perm.can_view ? 1 : 0, perm.can_create ? 1 : 0, perm.can_edit ? 1 : 0, perm.can_delete ? 1 : 0]
                );
            }
        }

        res.json({ success: true, message: 'Role updated' });
    } catch (error) {
        console.error('updateRole error:', error.message);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Role name already exists' });
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};

// DELETE /roles/:id
exports.deleteRole = async (req, res) => {
    try {
        if (req.user.role !== 'SUPER_ADMIN') return res.status(403).json({ message: 'Forbidden' });
        const { id } = req.params;

        let userCount = 0;
        try {
            const [[row]] = await db.query('SELECT COUNT(*) as count FROM college_admins WHERE role_id = ?', [id]);
            userCount = row.count;
        } catch (_) { /* safe */ }

        if (userCount > 0) {
            return res.status(400).json({ message: `Cannot delete — ${userCount} user(s) assigned to this role. Reassign first.` });
        }

        await db.query('DELETE FROM roles WHERE id = ?', [id]);
        res.json({ success: true, message: 'Role deleted' });
    } catch (error) {
        console.error('deleteRole error:', error.message);
        res.status(500).json({ message: 'Server Error: ' + error.message });
    }
};
