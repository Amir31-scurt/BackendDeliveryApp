-- Add payout columns to orders table if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='products_total') THEN
        ALTER TABLE orders ADD COLUMN products_total DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='delivery_fee') THEN
        ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='service_fee') THEN
        ALTER TABLE orders ADD COLUMN service_fee DECIMAL(10,2) DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='restaurant_payout') THEN
        ALTER TABLE orders ADD COLUMN restaurant_payout DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='deliverer_payout') THEN
        ALTER TABLE orders ADD COLUMN deliverer_payout DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='gourmet_payout') THEN
        ALTER TABLE orders ADD COLUMN gourmet_payout DECIMAL(10,2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='orders' AND column_name='currency') THEN
        ALTER TABLE orders ADD COLUMN currency VARCHAR(10) DEFAULT 'XOF';
    END IF;
END $$;

-- Create push_tokens table if it doesn't exist
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, token)
);

-- Create payouts table if it doesn't exist
CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    deliverer_id UUID REFERENCES deliverers(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_reference VARCHAR(255),
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create payout_items table if it doesn't exist
CREATE TABLE IF NOT EXISTS payout_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id VARCHAR(255) NOT NULL,
    payout_id VARCHAR(255),
    target_type VARCHAR(50) NOT NULL,
    target_id UUID NOT NULL,
    receive_amount DECIMAL(10,2) NOT NULL,
    fee DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(50) NOT NULL,
    error_code VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Function to compute order payouts from total
CREATE OR REPLACE FUNCTION compute_order_from_total(p_order_id UUID)
RETURNS TABLE (
    restaurant_payout DECIMAL(10,2),
    deliverer_payout DECIMAL(10,2),
    gourmet_payout DECIMAL(10,2),
    products_total DECIMAL(10,2),
    delivery_fee DECIMAL(10,2),
    service_fee DECIMAL(10,2)
) AS $$
DECLARE
    v_total_amount DECIMAL(10,2);
    v_products_total DECIMAL(10,2);
    v_delivery_fee DECIMAL(10,2) := 500; -- Default delivery fee in XOF
    v_service_fee DECIMAL(10,2);
    v_restaurant_payout DECIMAL(10,2);
    v_deliverer_payout DECIMAL(10,2);
    v_gourmet_payout DECIMAL(10,2);
    v_restaurant_commission DECIMAL(5,2) := 15.0; -- 15% commission
    v_deliverer_fee DECIMAL(10,2) := 1000; -- Fixed deliverer fee
BEGIN
    -- Get order total
    SELECT total_amount INTO v_total_amount
    FROM orders
    WHERE id = p_order_id;
    
    IF v_total_amount IS NULL THEN
        RAISE EXCEPTION 'Order not found: %', p_order_id;
    END IF;
    
    -- Calculate products total (sum of order items)
    SELECT COALESCE(SUM(price * quantity), 0) INTO v_products_total
    FROM order_items
    WHERE order_id = p_order_id;
    
    -- Calculate service fee (5% of products total)
    v_service_fee := v_products_total * 0.05;
    
    -- Calculate restaurant payout (products total - commission)
    v_restaurant_payout := v_products_total * (1 - v_restaurant_commission / 100);
    
    -- Calculate deliverer payout (delivery fee + fixed fee)
    v_deliverer_payout := v_delivery_fee + v_deliverer_fee;
    
    -- Calculate gourmet payout (service fee + restaurant commission)
    v_gourmet_payout := v_service_fee + (v_products_total * v_restaurant_commission / 100);
    
    -- Update the order with calculated values
    UPDATE orders
    SET 
        products_total = v_products_total,
        delivery_fee = v_delivery_fee,
        service_fee = v_service_fee,
        restaurant_payout = v_restaurant_payout,
        deliverer_payout = v_deliverer_payout,
        gourmet_payout = v_gourmet_payout
    WHERE id = p_order_id;
    
    -- Return the calculated values
    RETURN QUERY SELECT 
        v_restaurant_payout,
        v_deliverer_payout,
        v_gourmet_payout,
        v_products_total,
        v_delivery_fee,
        v_service_fee;
END;
$$ LANGUAGE plpgsql;

-- Function to get restaurant revenue
CREATE OR REPLACE FUNCTION rpc_restaurant_revenue(
    p_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    restaurant_id UUID,
    restaurant_name VARCHAR(255),
    restaurant_revenue DECIMAL(10,2),
    order_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id as restaurant_id,
        r.name as restaurant_name,
        COALESCE(SUM(o.restaurant_payout), 0) as restaurant_revenue,
        COUNT(o.id) as order_count
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
CREATE OR REPLACE FUNCTION rpc_deliverer_revenue(
    p_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    deliverer_id UUID,
    deliverer_name VARCHAR(255),
    deliverer_net_revenue DECIMAL(10,2),
    order_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id as deliverer_id,
        u.name as deliverer_name,
        COALESCE(SUM(o.deliverer_payout), 0) as deliverer_net_revenue,
        COUNT(o.id) as order_count
    FROM deliverers d
    INNER JOIN users u ON u.id = d.user_id
    LEFT JOIN orders o ON o.deliverer_id = d.id
        AND o.status = 'COMPLETED'
        AND (p_from IS NULL OR o.created_at >= p_from)
        AND (p_to IS NULL OR o.created_at <= p_to)
    GROUP BY d.id, u.name
    HAVING COALESCE(SUM(o.deliverer_payout), 0) > 0
    ORDER BY deliverer_net_revenue DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get gourmet revenue
CREATE OR REPLACE FUNCTION rpc_gourmet_revenue(
    p_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_to TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS TABLE (
    total_revenue DECIMAL(10,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(o.gourmet_payout), 0) as total_revenue
    FROM orders o
    WHERE o.status = 'COMPLETED'
        AND (p_from IS NULL OR o.created_at >= p_from)
        AND (p_to IS NULL OR o.created_at <= p_to);
END;
$$ LANGUAGE plpgsql;

