-- ============================================================
-- Migration 004: Recreate revenue functions with correct types
-- 
-- Uses TEXT instead of VARCHAR(255) for name columns because
-- the cPanel database stores names as TEXT type.
-- Drops all overloads first (CREATE OR REPLACE cannot change
-- return types once defined).
-- ============================================================

-- Drop all existing overloads
DROP FUNCTION IF EXISTS rpc_restaurant_revenue(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS rpc_restaurant_revenue(TIMESTAMP WITHOUT TIME ZONE, TIMESTAMP WITHOUT TIME ZONE);
DROP FUNCTION IF EXISTS rpc_restaurant_revenue();

DROP FUNCTION IF EXISTS rpc_deliverer_revenue(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS rpc_deliverer_revenue(TIMESTAMP WITHOUT TIME ZONE, TIMESTAMP WITHOUT TIME ZONE);
DROP FUNCTION IF EXISTS rpc_deliverer_revenue();

DROP FUNCTION IF EXISTS rpc_gourmet_revenue(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS rpc_gourmet_revenue(TIMESTAMP WITHOUT TIME ZONE, TIMESTAMP WITHOUT TIME ZONE);
DROP FUNCTION IF EXISTS rpc_gourmet_revenue();

-- Function to get restaurant revenue
-- Uses TEXT for restaurant_name to match actual column type on cPanel
CREATE FUNCTION rpc_restaurant_revenue(
    p_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    restaurant_id UUID,
    restaurant_name TEXT,
    restaurant_revenue DECIMAL(10,2),
    order_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id AS restaurant_id,
        r.name::TEXT AS restaurant_name,
        COALESCE(SUM(o.restaurant_payout), 0)::DECIMAL(10,2) AS restaurant_revenue,
        COUNT(o.id) AS order_count
    FROM restaurants r
    LEFT JOIN orders o ON o.restaurant_id = r.id
        AND o.status = 'COMPLETED'
        AND (p_from IS NULL OR o.created_at >= p_from)
        AND (p_to IS NULL OR o.created_at <= p_to)
    GROUP BY r.id, r.name
    HAVING COALESCE(SUM(o.restaurant_payout), 0) > 0
    ORDER BY restaurant_revenue DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get deliverer revenue
-- Uses TEXT for deliverer_name to match actual column type on cPanel
-- Joins orders via d.user_id (not d.id) since orders.deliverer_id stores user_id
CREATE FUNCTION rpc_deliverer_revenue(
    p_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    deliverer_id UUID,
    deliverer_name TEXT,
    deliverer_net_revenue DECIMAL(10,2),
    order_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id AS deliverer_id,
        u.name::TEXT AS deliverer_name,
        COALESCE(SUM(o.deliverer_payout), 0)::DECIMAL(10,2) AS deliverer_net_revenue,
        COUNT(o.id) AS order_count
    FROM deliverers d
    INNER JOIN users u ON u.id = d.user_id
    LEFT JOIN orders o ON o.deliverer_id = d.user_id
        AND o.status = 'COMPLETED'
        AND (p_from IS NULL OR o.created_at >= p_from)
        AND (p_to IS NULL OR o.created_at <= p_to)
    GROUP BY u.id, u.name
    HAVING COALESCE(SUM(o.deliverer_payout), 0) > 0
    ORDER BY deliverer_net_revenue DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get gourmet revenue
CREATE FUNCTION rpc_gourmet_revenue(
    p_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    total_revenue DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(o.gourmet_payout), 0)::DECIMAL(10,2) AS total_revenue
    FROM orders o
    WHERE o.status = 'COMPLETED'
        AND (p_from IS NULL OR o.created_at >= p_from)
        AND (p_to IS NULL OR o.created_at <= p_to);
END;
$$ LANGUAGE plpgsql;
