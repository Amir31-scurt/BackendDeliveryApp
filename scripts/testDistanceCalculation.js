import { supabase } from '../supabaseClient.js';

async function testDistanceCalculation() {
    try {
        console.log('Testing distance calculation...');

        // Test coordinates (Paris center)
        const testLat = 48.8566;
        const testLon = 2.3522;
        const maxDistance = 5.0; // 5km

        console.log(`Testing with coordinates: ${testLat}, ${testLon}`);
        console.log(`Max distance: ${maxDistance}km`);

        // Test the nearby restaurants function
        const { data, error } = await supabase
            .rpc('get_restaurants_nearby', {
                user_lat: testLat,
                user_lon: testLon,
                max_distance: maxDistance
            });

        if (error) {
            console.error('Error testing distance calculation:', error);
            return;
        }

        console.log(`\nFound ${data.length} restaurants within ${maxDistance}km:`);

        if (data.length === 0) {
            console.log('No restaurants found. Make sure you have restaurants with coordinates in the database.');
            console.log('You can add sample restaurants using: node scripts/addSampleRestaurants.js');
            return;
        }

        data.forEach((restaurant, index) => {
            console.log(`\n${index + 1}. ${restaurant.name}`);
            console.log(`   Address: ${restaurant.address}`);
            console.log(`   Coordinates: ${restaurant.latitude}, ${restaurant.longitude}`);
            console.log(`   Distance: ${restaurant.distance.toFixed(2)}km`);
            console.log(`   Type: ${restaurant.type}`);
        });

        // Test manual distance calculation
        console.log('\n--- Manual Distance Calculation Test ---');

        const { data: allRestaurants } = await supabase
            .from('restaurants')
            .select('id, name, latitude, longitude')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .limit(3);

        if (allRestaurants && allRestaurants.length > 0) {
            console.log('Manual distance calculation for first 3 restaurants:');

            allRestaurants.forEach((restaurant, index) => {
                const distance = calculateHaversineDistance(
                    testLat, testLon,
                    restaurant.latitude, restaurant.longitude
                );

                console.log(`${index + 1}. ${restaurant.name}: ${distance.toFixed(2)}km`);
            });
        }

    } catch (error) {
        console.error('Test error:', error);
    }
}

// Haversine formula implementation for testing
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Run the test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testDistanceCalculation();
}

export { testDistanceCalculation }; 