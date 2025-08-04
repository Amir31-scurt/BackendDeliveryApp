-- Add latitude and longitude columns to restaurants table
ALTER TABLE restaurants 
ADD COLUMN latitude DECIMAL(10, 8),
ADD COLUMN longitude DECIMAL(11, 8);

-- Create index for location-based queries
CREATE INDEX idx_restaurants_location ON restaurants(latitude, longitude);

-- Create a function to calculate distance between two points using Haversine formula
CREATE OR REPLACE FUNCTION calculate_distance(
    lat1 DECIMAL(10, 8),
    lon1 DECIMAL(11, 8),
    lat2 DECIMAL(10, 8),
    lon2 DECIMAL(11, 8)
)
RETURNS DECIMAL(10, 2) AS $$
DECLARE
    R DECIMAL(10, 2) := 6371; -- Earth's radius in kilometers
    dlat DECIMAL(10, 8);
    dlon DECIMAL(11, 8);
    a DECIMAL(10, 8);
    c DECIMAL(10, 8);
BEGIN
    -- Convert degrees to radians
    dlat := RADIANS(lat2 - lat1);
    dlon := RADIANS(lon2 - lon1);
    
    -- Haversine formula
    a := SIN(dlat/2) * SIN(dlat/2) + 
         COS(RADIANS(lat1)) * COS(RADIANS(lat2)) * 
         SIN(dlon/2) * SIN(dlon/2);
    c := 2 * ATAN2(SQRT(a), SQRT(1-a));
    
    RETURN R * c;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get restaurants within a certain distance
CREATE OR REPLACE FUNCTION get_restaurants_nearby(
    user_lat DECIMAL(10, 8),
    user_lon DECIMAL(11, 8),
    max_distance DECIMAL(10, 2) DEFAULT 10.0
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    description TEXT,
    address VARCHAR(255),
    type restaurant_type,
    opening_hours JSONB,
    phone_number VARCHAR(20),
    email VARCHAR(255),
    image_url VARCHAR(255),
    is_active BOOLEAN,
    rating FLOAT,
    total_ratings INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    distance DECIMAL(10, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.name,
        r.description,
        r.address,
        r.type,
        r.opening_hours,
        r.phone_number,
        r.email,
        r.image_url,
        r.is_active,
        r.rating,
        r.total_ratings,
        r.created_at,
        r.updated_at,
        calculate_distance(user_lat, user_lon, r.latitude, r.longitude) as distance
    FROM restaurants r
    WHERE r.is_active = true
    AND r.latitude IS NOT NULL 
    AND r.longitude IS NOT NULL
    AND calculate_distance(user_lat, user_lon, r.latitude, r.longitude) <= max_distance
    ORDER BY distance ASC;
END;
$$ LANGUAGE plpgsql; 