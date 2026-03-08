import { supabase } from '../supabaseClient.js';

async function checkRestaurants() {
    try {
        

        // Get all restaurants
        const { data: allRestaurants, error } = await supabase
            .from('restaurants')
            .select('id, name, address, latitude, longitude, is_active');

        if (error) {
            console.error('Error fetching restaurants:', error);
            return;
        }

        

        if (allRestaurants.length === 0) {
            

            // Import and run the sample restaurants script
            const { addSampleRestaurants } = await import('./addSampleRestaurants.js');
            await addSampleRestaurants();

            return;
        }

        // Check restaurants with coordinates
        const restaurantsWithCoords = allRestaurants.filter(r => r.latitude && r.longitude);
        const restaurantsWithoutCoords = allRestaurants.filter(r => !r.latitude || !r.longitude);

        
        

        if (restaurantsWithCoords.length > 0) {
            
            restaurantsWithCoords.forEach((restaurant, index) => {
                
                
                
                
                
            });
        }

        if (restaurantsWithoutCoords.length > 0) {
            
            restaurantsWithoutCoords.forEach((restaurant, index) => {
                
                
                
                
            });
        }

        // Test distance calculation if we have restaurants with coordinates
        if (restaurantsWithCoords.length > 0) {
            
            const testLat = 48.8566;
            const testLon = 2.3522;
            const maxDistance = 5.0;

            
            

            const calculateDistance = (lat1, lon1, lat2, lon2) => {
                const R = 6371;
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a =
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            };

            const nearbyRestaurants = restaurantsWithCoords
                .map(restaurant => {
                    const distance = calculateDistance(testLat, testLon, restaurant.latitude, restaurant.longitude);
                    return { ...restaurant, distance };
                })
                .filter(restaurant => restaurant.distance <= maxDistance)
                .sort((a, b) => a.distance - b.distance);

            

            nearbyRestaurants.forEach((restaurant, index) => {
                
            });
        }

    } catch (error) {
        console.error('Script error:', error);
    }
}

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    checkRestaurants();
}

export { checkRestaurants }; 