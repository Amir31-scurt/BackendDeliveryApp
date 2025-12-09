# Troubleshooting Database Connection Issues

## Password Authentication Failed (Error 28P01)

If you see: `password authentication failed for user "gourmet_user"`

### Solution:

1. **Verify the password in cPanel:**
   - Log into your cPanel
   - Go to **PostgreSQL Databases** (or **MySQL Databases** if using MySQL)
   - Find your database user
   - Click **Change Password** to reset it
   - Copy the new password

2. **Update your .env file:**
   ```env
   HOST=localhost
   PORT=5432
   DB=gourmet_prod
   USER=gourmet_user
   PASSWORD=your_new_password_here
   SSL=false
   ```

3. **Important notes:**
   - Don't use quotes around the password value
   - Don't add extra spaces
   - Make sure the password matches exactly what's in cPanel

4. **Test again:**
   ```bash
   node scripts/testPostgresConnection.js
   ```

## Connection Refused (Error ECONNREFUSED)

If you see: `connect ECONNREFUSED`

### Solution:

1. **Check if PostgreSQL is running:**
   - In cPanel, verify PostgreSQL service is active
   - Contact your hosting provider if needed

2. **Verify host and port:**
   - For cPanel, the host is usually `localhost`
   - Port is usually `5432` for PostgreSQL
   - Some hosts use a different port - check cPanel database settings

3. **Check firewall/security:**
   - Some hosts require SSL connections
   - Try setting `SSL=true` in your .env file

## Database Does Not Exist (Error 3D000)

If you see: `database "gourmet_prod" does not exist`

### Solution:

1. **Create the database in cPanel:**
   - Go to **PostgreSQL Databases**
   - Create a new database
   - Note the exact database name (it might have a prefix like `username_`)

2. **Update your .env file:**
   ```env
   DB=your_actual_database_name
   ```

## Common Issues

### Environment Variables Not Loading

- Make sure `.env` file is in the `BackendDeliveryApp/` directory
- Check for typos in variable names (HOST, DB, USER, PASSWORD)
- Restart your application after changing .env

### Special Characters in Password

If your password contains special characters:
- Some characters might need to be escaped
- Try changing the password in cPanel to use only alphanumeric characters
- Or wrap the password in quotes in .env: `PASSWORD="your@password#here"`

### cPanel Database Prefix

Many cPanel hosts add a prefix to database names:
- If your cPanel username is `john`, database might be `john_gourmet_prod`
- Check the exact name in cPanel and use that in your .env file

## Getting Help

If you're still having issues:
1. Check the exact error message
2. Verify all credentials in cPanel match your .env file
3. Contact your hosting provider for database connection details
4. Check if your hosting plan includes PostgreSQL (some only have MySQL)

