const { setDefaultResultOrder } = require('dns')
setDefaultResultOrder('ipv4first')

const postgres = require('postgres')
require('dotenv').config()

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  connect_timeout: 30,
  idle_timeout: 20,
  max: 10
})

sql`SELECT NOW()`
  .then(res => {
    console.log('✅ Supabase connected:', res[0].now)
  })
  .catch(err => {
    console.error('❌ Supabase connection failed:', err.message)
  })

module.exports = sql
