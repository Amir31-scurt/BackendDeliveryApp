const { supabase } = require('../supabaseClient.js');

async function testConnection() {
    try {
        

        // Test basic connection
        const { data, error } = await supabase
            .from('restaurants')
            .select('count')
            .limit(1);

        if (error) {
            console.error('Connection error:', error);
            return;
        }

        

        // Test getting restaurants count
        const { count, error: countError } = await supabase
            .from('restaurants')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error('Count error:', countError);
        } else {
            
        }

        // Test getting a few restaurants
        const { data: restaurants, error: fetchError } = await supabase
            .from('restaurants')
            .select('id, name, address, latitude, longitude')
            .limit(5);

        if (fetchError) {
            console.error('Fetch error:', fetchError);
        } else {
            
            restaurants.forEach((restaurant, index) => {
                
                
                
                
            });
        }

    } catch (error) {
        console.error('Test error:', error);
    }
}

// Run the test if called directly
if (require.main === module) {
    testConnection();
}

module.exports = { testConnection }; 