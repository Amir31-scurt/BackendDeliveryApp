# Migration from Supabase to PostgreSQL (cPanel)

This guide explains the migration from Supabase to PostgreSQL on cPanel.

## Changes Made

1. **Database Connection**: Replaced Supabase client with PostgreSQL connection using `pg` library
2. **Query Builder**: Created a Supabase-compatible query builder (`dbHelper.js`) to minimize code changes
3. **File Storage**: Replaced Supabase Storage with local file storage in `public/uploads/`
4. **RPC Functions**: Created SQL stored procedures for all RPC functions

## Environment Variables

Update your `.env` file with the following PostgreSQL connection variables:

```env
# PostgreSQL Database Configuration
DB_HOST=your-cpanel-db-host
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_SSL=false  # Set to 'true' if your cPanel requires SSL

# Keep existing variables
JWT_SECRET=your_jwt_secret
NODE_ENV=production
PORT=4000
WAVE_API_KEY=your_wave_api_key
```

## Database Setup

1. **Create the database** in cPanel:
   - Go to cPanel → MySQL Databases (or PostgreSQL if available)
   - Create a new database
   - Create a database user and grant all privileges

2. **Run migrations** in order:
   ```bash
   # Connect to your PostgreSQL database via cPanel phpPgAdmin or command line
   psql -h your-host -U your-user -d your-database
   
   # Then run:
   \i migrations/001_initial_schema.sql
   \i migrations/002_add_restaurant_location.sql
   \i migrations/003_add_payout_functions.sql
   ```

3. **Import your data** from Supabase:
   - Export data from Supabase dashboard
   - Import into your PostgreSQL database

## File Storage

Files are now stored locally in:
- Restaurant images: `public/uploads/restaurants/`
- Profile pictures: `public/uploads/profiles/`

Make sure these directories exist and are writable:
```bash
mkdir -p public/uploads/restaurants
mkdir -p public/uploads/profiles
chmod 755 public/uploads/restaurants
chmod 755 public/uploads/profiles
```

## Testing the Connection

Run the test script to verify your database connection:

```bash
node scripts/testPostgresConnection.js
```

## API Compatibility

The migration maintains backward compatibility. All existing code using `supabase.from()` will continue to work because `supabaseClient.js` now exports the PostgreSQL helper.

## Differences from Supabase

1. **Storage**: No cloud storage - files are stored locally
2. **Real-time**: Real-time subscriptions are not supported (if you were using them)
3. **Auth**: Authentication is handled by your application, not Supabase Auth

## Troubleshooting

### Connection Issues
- Verify your database credentials in `.env`
- Check if your cPanel allows remote connections
- Ensure the database user has proper permissions

### RPC Function Errors
- Make sure all migration files have been run
- Check that functions exist: `SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public';`

### File Upload Issues
- Check directory permissions
- Ensure `public/uploads/` directories exist
- Verify disk space on your server

## Next Steps

1. Update your production `.env` file with cPanel database credentials
2. Run database migrations
3. Test the connection using the test script
4. Deploy and monitor for any issues

