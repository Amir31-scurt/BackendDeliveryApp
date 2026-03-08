import { query } from './db.js';
import crypto from 'crypto';

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
        this.action = 'select'; // select, insert, update, delete
        this.actionData = null;
        this.orFilters = [];
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

    not(column, operator, value) {
        this.whereConditions[`${column}__not__${operator}`] = value;
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

    ilike(column, pattern) {
        this.whereConditions[`${column}__ilike`] = pattern;
        return this;
    }

    or(filterString) {
        // Store raw OR filter strings for building the WHERE clause
        if (!this.orFilters) this.orFilters = [];
        this.orFilters.push(filterString);
        return this;
    }

    async execute() {
        if (this.action === 'select') {
            return this._executeSelect();
        } else if (this.action === 'insert') {
            return this._executeInsert();
        } else if (this.action === 'update') {
            return this._executeUpdate();
        } else if (this.action === 'delete') {
            return this._executeDelete();
        }
    }

    _buildWhere(startParamCount = 1) {
        const clauses = [];
        const params = [];
        let paramCount = startParamCount;

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
                } else if (key.endsWith('__ilike')) {
                    const column = key.replace('__ilike', '');
                    clauses.push(`${column} ILIKE $${paramCount++}`);
                    params.push(value);
                } else if (key.includes('__not__')) {
                    const parts = key.split('__not__');
                    const column = parts[0];
                    const op = parts[1];
                    if (op === 'is' && (value === null || value === 'null')) {
                        clauses.push(`${column} IS NOT NULL`);
                    } else if (op === 'eq') {
                        clauses.push(`${column} != $${paramCount++}`);
                        params.push(value);
                    } else if (op === 'in') {
                        if (Array.isArray(value) && value.length > 0) {
                            const placeholders = value.map(() => `$${paramCount++}`).join(', ');
                            clauses.push(`${column} NOT IN (${placeholders})`);
                            params.push(...value);
                        }
                    }
                } else {
                    clauses.push(`${key} = $${paramCount++}`);
                    params.push(value);
                }
            }
        }

        // Handle OR filters
        if (this.orFilters && this.orFilters.length > 0) {
            const orClauses = [];
            for (const filterStr of this.orFilters) {
                const parts = filterStr.split(',');
                const parsedParts = parts.map(part => {
                    const segments = part.trim().split('.');
                    if (segments.length >= 3) {
                        const col = segments[0];
                        const op = segments[1];
                        const val = segments.slice(2).join('.');
                        if (op === 'ilike') {
                            params.push(val);
                            return `${col} ILIKE $${paramCount++}`;
                        } else if (op === 'eq') {
                            params.push(val);
                            return `${col} = $${paramCount++}`;
                        }
                    }
                    return null;
                }).filter(Boolean);
                if (parsedParts.length > 0) {
                    orClauses.push(`(${parsedParts.join(' OR ')})`);
                }
            }
            if (orClauses.length > 0) {
                clauses.push(orClauses.join(' AND '));
            }
        }

        return { clauses, params, nextParamCount: paramCount };
    }

    async _executeSelect() {
        const selectClause = Array.isArray(this.columns)
            ? this.columns.join(', ')
            : (this.columns === '*' ? '*' : this.columns);

        let sql = `SELECT ${selectClause} FROM ${this.tableName}`;
        const { clauses, params, nextParamCount } = this._buildWhere(1);
        let paramCount = nextParamCount;

        if (clauses.length > 0) {
            sql += ` WHERE ${clauses.join(' AND ')}`;
        }

        if (this.orderBy) {
            sql += ` ORDER BY ${this.orderBy}`;
        }

        if (this.limitValue) {
            sql += ` LIMIT $${paramCount++}`;
            params.push(this.limitValue);
        }

        if (this.offsetValue) {
            sql += ` OFFSET $${paramCount++}`;
            params.push(this.offsetValue);
        }

        const result = await query(sql, params);

        if (this.countOption === 'exact') {
            let countSql = `SELECT COUNT(*) as count FROM ${this.tableName}`;
            const { clauses: countClauses, params: countParams } = this._buildWhere(1);

            if (countClauses.length > 0) {
                countSql += ` WHERE ${countClauses.join(' AND ')}`;
            }

            const countResult = await query(countSql, countParams);
            const totalCount = parseInt(countResult.data?.[0]?.count || 0);

            if (this.headOption) {
                return { data: null, error: result.error, count: totalCount };
            } else {
                return { ...result, count: totalCount };
            }
        }

        return result;
    }

    async single() {
        // For selects, we can optimize with LIMIT 1
        if (this.action === 'select') {
            this.limitValue = 1;
        }
        
        const result = await this.execute();
        return {
            data: (Array.isArray(result.data) ? result.data[0] : result.data) || null,
            error: result.error
        };
    }

    insert(data) {
        this.action = 'insert';
        this.actionData = data;
        return this;
    }

    async _executeInsert() {
        const data = this.actionData;
        const isArray = Array.isArray(data);
        const records = (isArray ? data : [data]).map(record => {
            if (!record.id) {
                return { id: crypto.randomUUID(), ...record };
            }
            return record;
        });

        if (records.length === 0) {
            return { data: null, error: new Error('No data to insert') };
        }

        const keys = Object.keys(records[0]);
        const placeholders = records.map((_, idx) => {
            const start = idx * keys.length + 1;
            return `(${keys.map((_, i) => `$${start + i}`).join(', ')})`;
        }).join(', ');

        const values = records.flatMap(record => keys.map(key => {
            if (typeof record[key] === 'object' && record[key] !== null && !Array.isArray(record[key])) {
                return JSON.stringify(record[key]);
            }
            return record[key];
        }));

        const sql = `INSERT INTO ${this.tableName} (${keys.join(', ')}) VALUES ${placeholders} RETURNING *`;
        const result = await query(sql, values);
        return {
            data: result.data,
            error: result.error
        };
    }

    update(data) {
        this.action = 'update';
        this.actionData = data;
        return this;
    }

    async _executeUpdate() {
        const data = this.actionData;
        const keys = Object.keys(data).filter(k => k !== 'id');
        if (keys.length === 0) {
            return { data: null, error: new Error('No fields to update') };
        }

        const setClause = keys.map((key, idx) => {
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

        const { clauses, params } = this._buildWhere(keys.length + 1);
        values.push(...params);

        if (clauses.length === 0) {
            return { data: null, error: new Error('Update requires WHERE conditions') };
        }

        const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE ${clauses.join(' AND ')} RETURNING *`;
        const result = await query(sql, values);
        return {
            data: result.data,
            error: result.error
        };
    }

    delete() {
        this.action = 'delete';
        return this;
    }

    async _executeDelete() {
        const { clauses, params } = this._buildWhere(1);

        if (clauses.length === 0) {
            return { data: null, error: new Error('Delete requires WHERE conditions') };
        }

        const sql = `DELETE FROM ${this.tableName} WHERE ${clauses.join(' AND ')} RETURNING *`;
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

        const placeholders = paramNames.map((name, idx) => `${name} := $${idx + 1}`).join(', ');
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
