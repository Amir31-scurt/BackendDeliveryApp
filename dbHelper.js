import { query } from './db.js';

// Chainable query builder that mimics Supabase API
class QueryBuilder {
    constructor(tableName) {
        this.tableName = tableName;
        this.columns = '*';
        this.whereConditions = {};
        this.orderBy = null;
        this.limitValue = null;
        this.offsetValue = null;
        this.countOption = null;
        this.headOption = false;
    }

    select(columns = '*', options = {}) {
        this.columns = columns;
        if (options.count) this.countOption = options.count;
        if (options.head) this.headOption = options.head;
        return this;
    }

    eq(column, value) {
        this.whereConditions[column] = value;
        return this;
    }

    neq(column, value) {
        this.whereConditions[`${column}__neq`] = value;
        return this;
    }

    in(column, values) {
        this.whereConditions[`${column}__in`] = values;
        return this;
    }

    order(column, options = {}) {
        const ascending = options.ascending !== false;
        this.orderBy = `${column} ${ascending ? 'ASC' : 'DESC'}`;
        return this;
    }

    limit(count) {
        this.limitValue = count;
        return this;
    }

    range(from, to) {
        this.offsetValue = from;
        this.limitValue = to - from + 1;
        return this;
    }

    async execute() {
        const selectClause = Array.isArray(this.columns)
            ? this.columns.join(', ')
            : (this.columns === '*' ? '*' : this.columns);

        let sql = `SELECT ${selectClause} FROM ${this.tableName}`;
        const params = [];
        let paramCount = 1;

        // Build WHERE clause
        const clauses = [];
        for (const [key, value] of Object.entries(this.whereConditions)) {
            if (value !== undefined && value !== null) {
                if (key.endsWith('__neq')) {
                    const column = key.replace('__neq', '');
                    clauses.push(`${column} != $${paramCount++}`);
                    params.push(value);
                } else if (key.endsWith('__in')) {
                    const column = key.replace('__in', '');
                    if (Array.isArray(value) && value.length > 0) {
                        const placeholders = value.map(() => `$${paramCount++}`).join(', ');
                        clauses.push(`${column} IN (${placeholders})`);
                        params.push(...value);
                    }
                } else {
                    clauses.push(`${key} = $${paramCount++}`);
                    params.push(value);
                }
            }
        }

        if (clauses.length > 0) {
            sql += ` WHERE ${clauses.join(' AND ')}`;
        }

        // Handle order by
        if (this.orderBy) {
            sql += ` ORDER BY ${this.orderBy}`;
        }

        // Handle limit
        if (this.limitValue) {
            sql += ` LIMIT $${paramCount++}`;
            params.push(this.limitValue);
        }

        // Handle offset
        if (this.offsetValue) {
            sql += ` OFFSET $${paramCount++}`;
            params.push(this.offsetValue);
        }

        const result = await query(sql, params);

        // Handle count option
        if (this.countOption === 'exact' && this.headOption) {
            let countSql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
            const countParams = [];
            let countParamCount = 1;

            if (clauses.length > 0) {
                const countClauses = [];
                for (const [key, value] of Object.entries(this.whereConditions)) {
                    if (value !== undefined && value !== null) {
                        if (key.endsWith('__neq')) {
                            const column = key.replace('__neq', '');
                            countClauses.push(`${column} != $${countParamCount++}`);
                            countParams.push(value);
                        } else if (key.endsWith('__in')) {
                            const column = key.replace('__in', '');
                            if (Array.isArray(value) && value.length > 0) {
                                const placeholders = value.map(() => `$${countParamCount++}`).join(', ');
                                countClauses.push(`${column} IN (${placeholders})`);
                                countParams.push(...value);
                            }
                        } else {
                            countClauses.push(`${key} = $${countParamCount++}`);
                            countParams.push(value);
                        }
                    }
                }
                if (countClauses.length > 0) {
                    countSql += ` WHERE ${countClauses.join(' AND ')}`;
                }
            }

            const countResult = await query(countSql, countParams);
            return {
                data: null,
                error: result.error,
                count: parseInt(countResult.data?.[0]?.count || 0)
            };
        }

        return result;
    }

    async single() {
        this.limitValue = 1;
        const result = await this.execute();
        return {
            data: result.data?.[0] || null,
            error: result.error
        };
    }

    async insert(data, options = {}) {
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

        const values = records.flatMap(record => keys.map(key => {
            // Handle JSONB fields
            if (typeof record[key] === 'object' && record[key] !== null && !Array.isArray(record[key])) {
                return JSON.stringify(record[key]);
            }
            return record[key];
        }));

        const returning = options.returning || '*';
        const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES ${placeholders} RETURNING ${returning}`;

        const result = await query(sql, values);
        return {
            data: isArray ? result.data : (result.data?.[0] || null),
            error: result.error
        };
    }

    async update(data) {
        const keys = Object.keys(data).filter(k => k !== 'id');
        if (keys.length === 0) {
            return { data: null, error: new Error('No fields to update') };
        }

        const setClause = keys.map((key, idx) => {
            // Handle JSONB fields
            if (typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])) {
                return `${key} = $${idx + 1}::jsonb`;
            }
            return `${key} = $${idx + 1}`;
        }).join(', ');

        const values = keys.map(key => {
            if (typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])) {
                return JSON.stringify(data[key]);
            }
            return data[key];
        });

        // Build WHERE clause from whereConditions
        const whereClauses = [];
        let paramCount = keys.length + 1;
        for (const [key, value] of Object.entries(this.whereConditions)) {
            if (value !== undefined && value !== null) {
                if (key.endsWith('__neq')) {
                    const column = key.replace('__neq', '');
                    whereClauses.push(`${column} != $${paramCount++}`);
                    values.push(value);
                } else if (key.endsWith('__in')) {
                    const column = key.replace('__in', '');
                    if (Array.isArray(value) && value.length > 0) {
                        const placeholders = value.map(() => `$${paramCount++}`).join(', ');
                        whereClauses.push(`${column} IN (${placeholders})`);
                        values.push(...value);
                    }
                } else {
                    whereClauses.push(`${key} = $${paramCount++}`);
                    values.push(value);
                }
            }
        }

        if (whereClauses.length === 0) {
            return { data: null, error: new Error('Update requires WHERE conditions') };
        }

        const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${whereClauses.join(' AND ')} RETURNING *`;

        const result = await query(sql, values);
        return {
            data: result.data?.[0] || null,
            error: result.error
        };
    }

    async delete() {
        // Build WHERE clause from whereConditions
        const whereClauses = [];
        const params = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(this.whereConditions)) {
            if (value !== undefined && value !== null) {
                if (key.endsWith('__neq')) {
                    const column = key.replace('__neq', '');
                    whereClauses.push(`${column} != $${paramCount++}`);
                    params.push(value);
                } else if (key.endsWith('__in')) {
                    const column = key.replace('__in', '');
                    if (Array.isArray(value) && value.length > 0) {
                        const placeholders = value.map(() => `$${paramCount++}`).join(', ');
                        whereClauses.push(`${column} IN (${placeholders})`);
                        params.push(...value);
                    }
                } else {
                    whereClauses.push(`${key} = $${paramCount++}`);
                    params.push(value);
                }
            }
        }

        if (whereClauses.length === 0) {
            return { data: null, error: new Error('Delete requires WHERE conditions') };
        }

        const sql = `DELETE FROM ${this.tableName} WHERE ${whereClauses.join(' AND ')} RETURNING *`;
        const result = await query(sql, params);
        return { data: result.data, error: result.error };
    }

    // Make it thenable for async/await
    then(resolve, reject) {
        return this.execute().then(
            (result) => resolve ? resolve(result) : result,
            (error) => reject ? reject(error) : Promise.reject(error)
        );
    }
}

// Supabase-like query builder
export const db = {
    from: (tableName) => {
        return new QueryBuilder(tableName);
    },

    rpc: async (functionName, params = {}) => {
        const paramNames = Object.keys(params);
        const paramValues = Object.values(params);

        if (paramNames.length === 0) {
            const sql = `SELECT * FROM ${functionName}()`;
            const result = await query(sql, []);
            return { data: result.data, error: result.error };
        }

        const placeholders = paramNames.map((_, idx) => `$${idx + 1}`).join(', ');
        const sql = `SELECT * FROM ${functionName}(${placeholders})`;

        const result = await query(sql, paramValues);
        return { data: result.data, error: result.error };
    }
};

// Export for backward compatibility - add insert, update, delete to QueryBuilder prototype
QueryBuilder.prototype.insert = QueryBuilder.prototype.insert;
QueryBuilder.prototype.update = QueryBuilder.prototype.update;
QueryBuilder.prototype.delete = QueryBuilder.prototype.delete;

export default db;
