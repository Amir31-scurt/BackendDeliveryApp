import axios from 'axios';

/**
 * Geocode an address to get latitude and longitude coordinates
 * @param {string} address - The address to geocode
 * @returns {Promise<{latitude: number, longitude: number}>} - The coordinates
 */
export const geocodeAddress = async (address) => {
    try {
        // Using Nominatim (OpenStreetMap) for free geocoding
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: address,
                format: 'json',
                limit: 1,
                addressdetails: 1
            },
            headers: {
                'User-Agent': 'BackendDeliveryApp/1.0'
            }
        });

        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            return {
                latitude: parseFloat(result.lat),
                longitude: parseFloat(result.lon)
            };
        }

        throw new Error('No coordinates found for this address');
    } catch (error) {

        throw new Error(`Failed to geocode address: ${error.message}`);
    }
};

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} - Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Batch geocode multiple addresses
 * @param {string[]} addresses - Array of addresses to geocode
 * @returns {Promise<Array<{address: string, latitude: number, longitude: number}>>}
 */
export const batchGeocodeAddresses = async (addresses) => {
    const results = [];

    for (const address of addresses) {
        try {
            const coords = await geocodeAddress(address);
            results.push({
                address,
                ...coords
            });
            // Add delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {

            results.push({
                address,
                latitude: null,
                longitude: null,
                error: error.message
            });
        }
    }

    return results;
};