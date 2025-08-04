# Distance-Based Restaurant Filtering Feature

This feature allows restaurants to be filtered by distance from a user's location, making it easier for users to find nearby restaurants.

## Database Changes

### New Migration
Run the migration to add location fields to the restaurants table:

```sql
-- File: migrations/002_add_restaurant_location.sql
-- Adds latitude and longitude columns to restaurants table
-- Creates distance calculation functions
-- Creates nearby restaurant query function
```

### New Fields Added
- `latitude` (DECIMAL(10, 8)) - Restaurant's latitude coordinate
- `longitude` (DECIMAL(11, 8)) - Restaurant's longitude coordinate

## GraphQL Schema Updates

### Restaurant Type
The `Restaurant` type now includes:
- `latitude: Float` - Restaurant's latitude
- `longitude: Float` - Restaurant's longitude  
- `distance: Float` - Distance from user (when using nearby queries)

### New Query
```graphql
restaurantsNearby(latitude: Float!, longitude: Float!, maxDistance: Float): [Restaurant!]!
```

## API Usage

### Get Restaurants Near User Location
```graphql
query GetNearbyRestaurants($latitude: Float!, $longitude: Float!, $maxDistance: Float) {
  restaurantsNearby(latitude: $latitude, longitude: $longitude, maxDistance: $maxDistance) {
    id
    name
    description
    address
    type
    phoneNumber
    email
    rating
    distance
    latitude
    longitude
    openingHours {
      monday { open close }
      tuesday { open close }
      wednesday { open close }
      thursday { open close }
      friday { open close }
      saturday { open close }
      sunday { open close }
    }
  }
}
```

Variables:
```json
{
  "latitude": 48.8566,
  "longitude": 2.3522,
  "maxDistance": 5.0
}
```

### Create Restaurant with Coordinates
```graphql
mutation CreateRestaurant($input: CreateRestaurantInput!) {
  createRestaurant(input: $input) {
    id
    name
    address
    latitude
    longitude
  }
}
```

Variables:
```json
{
  "input": {
    "name": "New Restaurant",
    "description": "A great restaurant",
    "address": "123 Main St, City, Country",
    "type": "RESTAURANT",
    "phoneNumber": "+1234567890",
    "email": "contact@restaurant.com",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "openingHours": {
      "monday": { "open": "09:00", "close": "22:00" },
      "tuesday": { "open": "09:00", "close": "22:00" },
      "wednesday": { "open": "09:00", "close": "22:00" },
      "thursday": { "open": "09:00", "close": "22:00" },
      "friday": { "open": "09:00", "close": "22:00" },
      "saturday": { "open": "09:00", "close": "22:00" },
      "sunday": { "open": "09:00", "close": "22:00" }
    }
  }
}
```

## Setup Instructions

### 1. Run Database Migration
```bash
# Apply the new migration to add location fields
# This will add latitude/longitude columns and create distance calculation functions
```

### 2. Update Existing Restaurants
For existing restaurants without coordinates, you can:

#### Option A: Use the Geocoding Script
```bash
node scripts/updateRestaurantCoordinates.js
```

#### Option B: Manually Update Coordinates
Update the `latitude` and `longitude` fields in the restaurants table for each restaurant.

### 3. Add Sample Data (Optional)
```bash
node scripts/addSampleRestaurants.js
```

## Distance Calculation

The system uses the Haversine formula to calculate distances between coordinates:

- **Formula**: Calculates the great-circle distance between two points on a sphere
- **Unit**: Kilometers
- **Accuracy**: Suitable for most delivery applications

## Frontend Integration

### Getting User Location
```javascript
// Get user's current location
navigator.geolocation.getCurrentPosition(
  (position) => {
    const { latitude, longitude } = position.coords;
    // Use these coordinates in your GraphQL query
  },
  (error) => {
    console.error('Error getting location:', error);
  }
);
```

### Example React Hook
```javascript
import { useQuery } from '@apollo/client';
import { gql } from '@apollo/client';

const GET_NEARBY_RESTAURANTS = gql`
  query GetNearbyRestaurants($latitude: Float!, $longitude: Float!, $maxDistance: Float) {
    restaurantsNearby(latitude: $latitude, longitude: $longitude, maxDistance: $maxDistance) {
      id
      name
      description
      address
      distance
      rating
    }
  }
`;

function useNearbyRestaurants(latitude, longitude, maxDistance = 10) {
  return useQuery(GET_NEARBY_RESTAURANTS, {
    variables: { latitude, longitude, maxDistance },
    skip: !latitude || !longitude
  });
}
```

## Performance Considerations

1. **Indexing**: The database includes indexes on latitude/longitude for efficient queries
2. **Distance Limit**: Default max distance is 10km to prevent excessive results
3. **Caching**: Consider caching results for frequently requested locations
4. **Rate Limiting**: Geocoding services have rate limits, so batch updates carefully

## Error Handling

- Restaurants without coordinates will not appear in nearby searches
- Invalid coordinates will cause query errors
- Network issues with geocoding services should be handled gracefully

## Testing

Test the feature with:
1. Restaurants with valid coordinates
2. Different distance ranges
3. Edge cases (very close/far locations)
4. Invalid coordinates
5. Missing location data 