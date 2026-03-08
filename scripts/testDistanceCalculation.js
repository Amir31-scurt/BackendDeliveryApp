import { supabase } from '../supabaseClient.js';

async function testDistanceCalculation() {
    try {
        

        // Test coordinates (Paris center)
        const testLat = 48.8566;
        const testLon = 2.3522;
        const maxDistance = 5.0; // 5km

        
        

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

        

        if (data.length === 0) {
            
            
            return;
        }

        data.forEach((restaurant, index) => {
            
            
            
            
            
        });

        // Test manual distance calculation
        

        const { data: allRestaurants } = await supabase
            .from('restaurants')
            .select('id, name, latitude, longitude')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .limit(3);

        if (allRestaurants && allRestaurants.length > 0) {
            

            allRestaurants.forEach((restaurant, index) => {
                const distance = calculateHaversineDistance(
                    testLat, testLon,
                    restaurant.latitude, restaurant.longitude
                );

                
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