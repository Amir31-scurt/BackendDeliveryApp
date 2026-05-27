const { query } = require('../db.js');
const dotenv = require('dotenv');

dotenv.config();

async function testConnection() {
    try {
        

        // Check for required environment variables (matching db.js which uses HOST, DB, USER, PASSWORD)
        const requiredVars = ['HOST', 'DB', 'USER', 'PASSWORD'];
        const missingVars = requiredVars.filter(v => !process.env[v]);

        if (missingVars.length > 0) {
            console.error('❌ Missing required environment variables:');
            missingVars.forEach(v => console.error(`   - ${v}`));
            console.error('\n📝 Please create a .env file in BackendDeliveryApp/ with your database credentials.');
            console.error('   Required variables: HOST, DB, USER, PASSWORD');
            process.exit(1);
        }

        

        // Test basic connection
        const result = await query('SELECT NOW() as current_time, version() as version');

        if (result.error) {
            console.error('❌ Connection error:', result.error.message);

            // Provide helpful error messages
            if (result.error.code === '28P01') {
                console.error('\n🔐 Password authentication failed!');
                console.error('   The password for user "' + (process.env.USER || process.env.DB_USER) + '" is incorrect.');
                console.error('\n   To fix this:');
                console.error('   1. Go to your cPanel → PostgreSQL Databases');
                console.error('   2. Find the user "' + (process.env.USER || process.env.DB_USER) + '"');
                console.error('   3. Click "Change Password" and set a new password');
                console.error('   4. Update the PASSWORD value in your .env file');
                console.error('   5. Make sure there are no extra spaces or quotes in the .env file');
                console.error('\n   Example .env entry:');
                console.error('   PASSWORD=your_actual_password_here');
                console.error('\n   Note: Make sure your .env uses: HOST, DB, USER, PASSWORD (not DB_HOST, etc.)');
            } else if (result.error.code === 'ECONNREFUSED') {
                console.error('\n🔌 Connection refused!');
                console.error('   Please verify your HOST and PORT in the .env file.');
                console.error('   Make sure PostgreSQL is running and accessible.');
            } else if (result.error.code === '3D000') {
                console.error('\n📊 Database does not exist!');
                console.error('   Please verify your DB value in the .env file.');
                console.error('   Make sure the database "' + process.env.DB + '" exists in your cPanel.');
            } else {
                console.error('\n   Error code:', result.error.code);
                console.error('   Full error:', result.error);
            }
            return;
        }

        
        
        

        // Test getting restaurants count
        const countResult = await query('SELECT COUNT(*) as count FROM restaurants');

        if (countResult.error) {
            console.error('❌ Count error:', countResult.error);
        } else {
            
        }

        // Test getting a few restaurants
        const restaurantsResult = await query(
            'SELECT id, name, address, latitude, longitude FROM restaurants LIMIT 5'
        );

        if (restaurantsResult.error) {
            console.error('❌ Fetch error:', restaurantsResult.error);
        } else {
            
            restaurantsResult.data.forEach((restaurant, index) => {
                
                
                
                
            });
        }

        // Test RPC functions
        
        const monthlyOrdersResult = await query('SELECT * FROM get_monthly_orders()');
        if (monthlyOrdersResult.error) {
            console.error('❌ RPC function error:', monthlyOrdersResult.error);
        } else {
            
        }

        

    } catch (error) {
        console.error('❌ Test error:', error);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

// Run the test
testConnection();

