import { supabase } from '../supabaseClient.js';

async function testConnection() {
    try {
        console.log('Testing Supabase connection...');

        // Test basic connection
        const { data, error } = await supabase
            .from('restaurants')
            .select('count')
            .limit(1);

        if (error) {
            console.error('Connection error:', error);
            return;
        }

        console.log('✅ Supabase connection successful');

        // Test getting restaurants count
        const { count, error: countError } = await supabase
            .from('restaurants')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            console.error('Count error:', countError);
        } else {
            console.log(`Total restaurants: ${count}`);
        }

        // Test getting a few restaurants
        const { data: restaurants, error: fetchError } = await supabase
            .from('restaurants')
            .select('id, name, address, latitude, longitude')
            .limit(5);

        if (fetchError) {
            console.error('Fetch error:', fetchError);
        } else {
            console.log(`\nSample restaurants:`);
            restaurants.forEach((restaurant, index) => {
                console.log(`${index + 1}. ${restaurant.name || 'No name'}`);
                console.log(`   Address: ${restaurant.address || 'No address'}`);
                console.log(`   Coordinates: ${restaurant.latitude || 'No lat'}, ${restaurant.longitude || 'No lon'}`);
                console.log('');
            });
        }

    } catch (error) {
        console.error('Test error:', error);
    }
}

// Run the test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testConnection();
}

export { testConnection }; 