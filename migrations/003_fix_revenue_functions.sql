-- Fix revenue calculation functions

-- Function to calculate restaurant revenue breakdown
CREATE OR REPLACE FUNCTION rpc_restaurant_revenue(
  p_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_to TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
  restaurant_id UUID,
  restaurant_name VARCHAR,
  restaurant_revenue DECIMAL,
  order_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    COALESCE(SUM(o.restaurant_payout), 0) AS restaurant_revenue,
    COUNT(o.id) AS order_count
  FROM restaurants r
  JOIN orders o ON o.restaurant_id = r.id
  WHERE o.status = 'COMPLETED'
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at <= p_to)
  GROUP BY r.id, r.name;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate deliverer revenue breakdown
CREATE OR REPLACE FUNCTION rpc_deliverer_revenue(
  p_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_to TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
  deliverer_id UUID,
  deliverer_name VARCHAR,
  deliverer_net_revenue DECIMAL,
  order_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id AS deliverer_id,
    u.name AS deliverer_name,
    COALESCE(SUM(o.deliverer_payout), 0) AS deliverer_net_revenue,
    COUNT(o.id) AS order_count
  FROM deliverers d
  JOIN users u ON d.user_id = u.id
  JOIN orders o ON o.deliverer_id = d.id
  WHERE o.status = 'COMPLETED'
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at <= p_to)
  GROUP BY d.id, u.name;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate gourmet revenue
CREATE OR REPLACE FUNCTION rpc_gourmet_revenue(
  p_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_to TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
  total_revenue DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(o.gourmet_payout), 0) AS total_revenue
  FROM orders o
  WHERE o.status = 'COMPLETED'
    AND (p_from IS NULL OR o.created_at >= p_from)
    AND (p_to IS NULL OR o.created_at <= p_to);
END;
$$ LANGUAGE plpgsql;
