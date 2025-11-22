# Railway Deployment Setup

## Step 1: Set Environment Variables

Go to your Railway project dashboard and add these environment variables:

1. **BOT_TOKEN** - Your Discord bot token
2. **BOT_GUILD_ID** - Your Discord server ID (e.g., 1440390894430982224)
3. **BOT_ADMIN_ROLE_ID** - 1440390894430982224
4. **BOT_STAFF_ROLE_ID** - 1440390892900061336
5. **BOT_CUSTOMER_ROLE_ID** - Your customer role ID
6. **BOT_USER_ID_WHITELIST** - Comma-separated user IDs
7. **SA_API_KEY** - Your SellAuth API key
8. **SA_SHOP_ID** - 112723

## Step 2: Verify Configuration

1. Go to: https://railway.app/project/sell-auth-bot-test
2. Click your service (sell-auth-bot-test)
3. Go to "Settings" tab
4. Click "Environment" section
5. Verify all variables are present

## Step 3: Trigger Redeploy

1. Click "Deploy" tab
2. Click "Redeploy" button at the top right
3. Wait 2-3 minutes for deployment

## Step 4: Verify Deployment

1. Go to "Logs" tab
2. Should see: "✅ All environment variables loaded successfully"
3. Should see: "Snake Support ready!"

## Troubleshooting

If you see "TokenInvalid" error:
- Check that BOT_TOKEN is copied correctly (no spaces)
- Verify the token hasn't expired
- Regenerate the Discord bot token if needed

If variables are missing:
- Double-check all environment variables are added in Railway settings
- Use exact variable names from the list above
- No typos or extra spaces
