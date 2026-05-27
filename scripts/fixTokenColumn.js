const { query } = require('../db.js');
const dotenv = require('dotenv');

dotenv.config();

async function fixColumn() {
    try {
        console.log('Attempting to change delivery_token column type to VARCHAR(255)...');
        
        // Use standard SQL to alter the column type
        // This will also handle existing null values or converted values if possible
        const result = await query('ALTER TABLE orders ALTER COLUMN delivery_token TYPE VARCHAR(255)');
        
        if (result.error) {
            console.error('❌ Error during migration:', result.error.message);
            
            // Check for specific common errors
            if (result.error.code === '42703') {
                console.error('\n❓ Column "delivery_token" not found in "orders" table.');
            } else {
                console.error('\nFull error:', result.error);
            }
            return;
        }

        console.log('✅ Successfully altered delivery_token column to VARCHAR(255)!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        process.exit(0);
    }
}

fixColumn();
