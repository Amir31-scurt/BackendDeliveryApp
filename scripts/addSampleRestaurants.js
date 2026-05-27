const { supabase } = require('../supabaseClient.js');

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
        opening_hours: {
            monday: { open: "06:00", close: "20:00" },
            tuesday: { open: "06:00", close: "20:00" },
            wednesday: { open: "06:00", close: "20:00" },
            thursday: { open: "06:00", close: "20:00" },
            friday: { open: "06:00", close: "20:00" },
            saturday: { open: "06:00", close: "19:00" },
            sunday: { open: "07:00", close: "18:00" }
        }
    },
    {
        name: "Express Sushi",
        description: "Quick and fresh Japanese cuisine",
        address: "789 Boulevard Saint-Germain, Paris, France",
        type: "EXPRESS",
        phone_number: "+33 1 42 86 17 20",
        email: "contact@expresssushi.fr",
        latitude: 48.8534,
        longitude: 2.3488,
        opening_hours: {
            monday: { open: "11:30", close: "22:00" },
            tuesday: { open: "11:30", close: "22:00" },
            wednesday: { open: "11:30", close: "22:00" },
            thursday: { open: "11:30", close: "22:00" },
            friday: { open: "11:30", close: "23:00" },
            saturday: { open: "11:30", close: "23:00" },
            sunday: { open: "12:00", close: "21:00" }
        }
    },
    {
        name: "Café de Flore",
        description: "Historic café with traditional French dishes",
        address: "172 Boulevard Saint-Germain, Paris, France",
        type: "RESTAURANT",
        phone_number: "+33 1 45 48 55 26",
        email: "contact@cafedeflore.fr",
        latitude: 48.8539,
        longitude: 2.3344,
        opening_hours: {
            monday: { open: "07:00", close: "01:00" },
            tuesday: { open: "07:00", close: "01:00" },
            wednesday: { open: "07:00", close: "01:00" },
            thursday: { open: "07:00", close: "01:00" },
            friday: { open: "07:00", close: "01:00" },
            saturday: { open: "07:00", close: "01:00" },
            sunday: { open: "07:00", close: "01:00" }
        }
    },
    {
        name: "Pâtisserie Ladurée",
        description: "Famous for macarons and French pastries",
        address: "75 Avenue des Champs-Élysées, Paris, France",
        type: "BOULANGERIE",
        phone_number: "+33 1 40 75 08 75",
        email: "contact@laduree.fr",
        latitude: 48.8698,
        longitude: 2.3077,
        opening_hours: {
            monday: { open: "08:00", close: "20:00" },
            tuesday: { open: "08:00", close: "20:00" },
            wednesday: { open: "08:00", close: "20:00" },
            thursday: { open: "08:00", close: "20:00" },
            friday: { open: "08:00", close: "20:00" },
            saturday: { open: "08:00", close: "20:00" },
            sunday: { open: "09:00", close: "19:00" }
        }
    }
];

async function addSampleRestaurants() {
    try {
        

        for (const restaurant of sampleRestaurants) {
            const { data, error } = await supabase
                .from('restaurants')
                .insert(restaurant)
                .select();

            if (error) {
                console.error(`Error adding ${restaurant.name}:`, error);
            } else {
                
            }
        }

        

    } catch (error) {
        console.error('Script error:', error);
    }
}

// Run the script if called directly
if (require.main === module) {
    addSampleRestaurants();
}

module.exports = { addSampleRestaurants }; 