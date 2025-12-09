import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(process.cwd(), '.env') });

const { Pool } = pg;

// Validate required environment variables
const requiredEnvVars = ['HOST', 'DB', 'USER', 'PASSWORD'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n📝 Please create a .env file in BackendDeliveryApp/ with the following variables:');
  console.error('   HOST=your-database-host');
  console.error('   PORT=5432');
  console.error('   DB=your-database-name');
  console.error('   USER=your-database-user');
  console.error('   PASSWORD=your-database-password');
  console.error('   SSL=false');
  console.error('\nSee MIGRATION_GUIDE.md for more details.');
}

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.HOST || 'localhost',
  port: Number(process.env.PORT || 5432),
  database: process.env.DB || 'postgres',
  user: process.env.USER || 'postgres',
  password: process.env.PASSWORD ? String(process.env.PASSWORD) : '',
  ssl: process.env.SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Query helper function
export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    return { data: res.rows, error: null, count: res.rowCount };
  } catch (error) {
    console.error('Database query error:', error);
    return { data: null, error, count: 0 };
  }
};

// Helper function to simulate Supabase's .from().select() pattern
export const db = {
  from: (tableName) => ({
    select: async (columns = '*', options = {}) => {
      const selectClause = columns === '*' ? '*' :
        (Array.isArray(columns) ? columns.join(', ') : columns);

      let sql = `SELECT ${selectClause} FROM ${tableName}`;
      const params = [];
      let paramCount = 1;

      // Handle where conditions
      if (options.where) {
        const conditions = [];
        for (const [key, value] of Object.entries(options.where)) {
          if (value !== undefined && value !== null) {
            conditions.push(`${key} = $${paramCount}`);
            params.push(value);
            paramCount++;
          }
        }
        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(' AND ')}`;
        }
      }

      // Handle limit
      if (options.limit) {
        sql += ` LIMIT $${paramCount}`;
        params.push(options.limit);
        paramCount++;
      }

      // Handle order by
      if (options.orderBy) {
        sql += ` ORDER BY ${options.orderBy}`;
      }

      const result = await query(sql, params);

      // Handle count option
      if (options.count === 'exact' && options.head) {
        const countResult = await query(`SELECT COUNT(*) as count FROM ${tableName}`, []);
        return {
          data: null,
          error: result.error,
          count: countResult.data?.[0]?.count || 0
        };
      }

      return result;
    },

    insert: async (data) => {
      const isArray = Array.isArray(data);
      const records = isArray ? data : [data];

      if (records.length === 0) {
        return { data: null, error: new Error('No data to insert') };
      }

      const keys = Object.keys(records[0]);
      const placeholders = records.map((_, idx) => {
        const start = idx * keys.length + 1;
        return `(${keys.map((_, i) => `$${start + i}`).join(', ')})`;
      }).join(', ');

      const values = records.flatMap(record => keys.map(key => record[key]));
      const sql = `INSERT INTO ${tableName} (${keys.join(', ')}) VALUES ${placeholders} RETURNING *`;

      const result = await query(sql, values);
      return {
        data: isArray ? result.data : (result.data?.[0] || null),
        error: result.error
      };
    },

    update: async (data) => {
      const keys = Object.keys(data).filter(k => k !== 'id');
      const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
      const values = keys.map(key => data[key]);
      const sql = `UPDATE ${tableName} SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`;

      const result = await query(sql, [...values, data.id]);
      return {
        data: result.data?.[0] || null,
        error: result.error
      };
    },

    delete: async () => ({
      eq: async (column, value) => {
        const sql = `DELETE FROM ${tableName} WHERE ${column} = $1 RETURNING *`;
        const result = await query(sql, [value]);
        return { data: result.data, error: result.error };
      }
    }),

    eq: (column, value) => ({
      select: async (columns = '*', options = {}) => {
        return db.from(tableName).select(columns, { ...options, where: { [column]: value } });
      },
      update: async (data) => {
        const keys = Object.keys(data);
        const setClause = keys.map((key, idx) => `${key} = $${idx + 1}`).join(', ');
        const values = keys.map(key => data[key]);
        const sql = `UPDATE ${tableName} SET ${setClause} WHERE ${column} = $${keys.length + 1} RETURNING *`;

        const result = await query(sql, [...values, value]);
        return {
          data: result.data?.[0] || null,
          error: result.error
        };
      },
      delete: async () => {
        const sql = `DELETE FROM ${tableName} WHERE ${column} = $1 RETURNING *`;
        const result = await query(sql, [value]);
        return { data: result.data, error: result.error };
      },
      single: async () => {
        const result = await db.from(tableName).select('*', { where: { [column]: value }, limit: 1 });
        return {
          data: result.data?.[0] || null,
          error: result.error
        };
      }
    }),

    single: async () => {
      const result = await db.from(tableName).select('*', { limit: 1 });
      return {
        data: result.data?.[0] || null,
        error: result.error
      };
    }
  }),

  rpc: async (functionName, params = {}) => {
    const paramNames = Object.keys(params);
    const paramValues = Object.values(params);
    const placeholders = paramNames.map((_, idx) => `$${idx + 1}`).join(', ');
    const sql = `SELECT * FROM ${functionName}(${placeholders})`;

    const result = await query(sql, paramValues);
    return { data: result.data, error: result.error };
  }
};

// Export pool for direct access if needed
export { pool };

// Default export for backward compatibility
export default db;
