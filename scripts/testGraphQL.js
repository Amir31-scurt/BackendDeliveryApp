import { supabase } from '../supabaseClient.js';

async function testGraphQLQuery() {
    try {
        console.log('Testing GraphQL restaurantsNearby query...');

        // Test coordinates (Paris center)
        const testLat = 48.8566;
        const testLon = 2.3522;
        const maxDistance = 10.0;

        console.log(`Testing with coordinates: ${testLat}, ${testLon}`);
        console.log(`Max distance: ${maxDistance}km`);

        // First, let's check what restaurants exist
        const { data: allRestaurants, error: fetchError } = await supabase
            .from("restaurants")
            .select("*");

        if (fetchError) {
            console.error('Error fetching restaurants:', fetchError);
            return;
        }

        console.log(`\nTotal restaurants in database: ${allRestaurants.length}`);

        if (allRestaurants.length === 0) {
            console.log('No restaurants found. Adding sample data...');

            // Add sample restaurants
            const sampleRestaurants = [
                {
                    name: "Le Petit Bistrot",
                    description: "Authentic French cuisine in a cozy atmosphere",
                    address: "123 Rue de la Paix, Paris, France",
                    type: "RESTAURANT",
                    phone_number: "+33 1 42 86 17 18",
                    email: "contact@lepetitbistrot.fr",
                    latitude: 48.8566,
                    longitude: 2.3522,
                    is_active: true,
                    opening_hours: {
                        monday: { open: "11:00", close: "23:00" },
                        tuesday: { open: "11:00", close: "23:00" },
                        wednesday: { open: "11:00", close: "23:00" },
                        thursday: { open: "11:00", close: "23:00" },
                        friday: { open: "11:00", close: "00:00" },
                        saturday: { open: "11:00", close: "00:00" },
                        sunday: { open: "12:00", close: "22:00" }
                    }
                },
                {
                    name: "Boulangerie Artisanale",
                    description: "Fresh bread and pastries made daily",
                    address: "456 Avenue des Champs-Élysées, Paris, France",
                    type: "BOULANGERIE",
                    phone_number: "+33 1 42 86 17 19",
                    email: "contact@boulangerie-artisanale.fr",
                    latitude: 48.8698,
                    longitude: 2.3077,
                    is_active: true,
                    opening_hours: {
                        monday: { open: "06:00", close: "20:00" },
                        tuesday: { open: "06:00", close: "20:00" },
                        wednesday: { open: "06:00", close: "20:00" },
                        thursday: { open: "06:00", close: "20:00" },
                        friday: { open: "06:00", close: "20:00" },
                        saturday: { open: "06:00", close: "19:00" },
                        sunday: { open: "07:00", close: "18:00" }
                    }
                }
            ];

            for (const restaurant of sampleRestaurants) {
                const { data, error } = await supabase
                    .from('restaurants')
                    .insert(restaurant)
                    .select();

                if (error) {
                    console.error(`Error adding ${restaurant.name}:`, error);
                } else {
                    console.log(`✅ Added ${restaurant.name}`);
                }
            }

            // Fetch again after adding
            const { data: newRestaurants } = await supabase
                .from("restaurants")
                .select("*");

            console.log(`\nRestaurants after adding samples: ${newRestaurants.length}`);
        }

        // Now test the distance calculation logic
        const { data: restaurantsWithCoords, error: coordsError } = await supabase
            .from("restaurants")
            .select("*")
            .not('latitude', 'is', null)
            .not('longitude', 'is', null)
            .eq('is_active', true);

        if (coordsError) {
            console.error('Error fetching restaurants with coordinates:', coordsError);
            return;
        }

        console.log(`\nRestaurants with coordinates: ${restaurantsWithCoords.length}`);

        if (restaurantsWithCoords.length === 0) {
            console.log('No restaurants with coordinates found. This is why the query returns empty.');
            return;
        }

        // Calculate distances manually
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

        const restaurantsWithDistance = restaurantsWithCoords
            .map(restaurant => {
                const distance = calculateDistance(testLat, testLon, restaurant.latitude, restaurant.longitude);
                return { ...restaurant, distance };
            })
            .filter(restaurant => restaurant.distance <= maxDistance)
            .sort((a, b) => a.distance - b.distance);

        console.log(`\nFound ${restaurantsWithDistance.length} restaurants within ${maxDistance}km:`);

        restaurantsWithDistance.forEach((restaurant, index) => {
            console.log(`${index + 1}. ${restaurant.name}`);
            console.log(`   Address: ${restaurant.address}`);
            console.log(`   Coordinates: ${restaurant.latitude}, ${restaurant.longitude}`);
            console.log(`   Distance: ${restaurant.distance.toFixed(2)}km`);
            console.log('');
        });

    } catch (error) {
        console.error('Test error:', error);
    }
}

// Run the test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testGraphQLQuery();
}

export { testGraphQLQuery }; 