# Database Migrations

This folder contains the SQL migration files for setting up the PostgreSQL database for the delivery app.

## Migration Files

- `001_initial_schema.sql`: Creates the initial database schema with all necessary tables, types, and indexes.

## How to Apply Migrations

1. Connect to your PostgreSQL database:
```bash
psql -U your_username -d your_database_name
```

2. Run the migration file:
```bash
\i migrations/001_initial_schema.sql
```

## Database Structure

The database includes the following tables:

- `users`: Stores user information
- `restaurants`: Stores restaurant information
- `menu_items`: Stores menu items for restaurants
- `deliverers`: Stores deliverer information
- `orders`: Stores order information
- `order_items`: Stores items within each order
- `restaurant_ratings`: Stores restaurant ratings and reviews
- `notifications`: Stores user notifications

## Enums

The database uses the following enum types:

- `user_type`: 'deliverer', 'customer', 'admin', 'guest'
- `restaurant_type`: 'RESTAURANT', 'BOULANGERIE', 'EXPRESS'
- `order_status`: 'Pending', 'PREPARING', 'DELIVERING', 'COMPLETED', 'CANCELLED'
- `payment_method`: 'CASH', 'ORANGE_MONEY', 'WAVE'

## Features

- Automatic UUID generation for primary keys
- Automatic timestamp management for created_at and updated_at
- Foreign key constraints for data integrity
- Indexes for better query performance
- JSONB fields for flexible data storage (opening_hours, delivery_address, etc.)
- Trigger functions for updating timestamps 