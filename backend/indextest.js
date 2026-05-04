const { setDefaultResultOrder } = require('dns')
setDefaultResultOrder('ipv4first')

const postgres = require('postgres')
require('dotenv').config()

console.log('--- TESTING CONNECTION TO SUPABASE ---')
console.log('URL being used:', process.env.DATABASE_URL)

const sql = postgres(process.env.DATABASE_URL, {
  ssl: 'require',
  connect_timeout: 30,
  idle_timeout: 20,
  max: 1
})

async function testConnection() {
  try {
    const result = await sql`SELECT NOW()`
    console.log('✅ CONNECTION SUCCESSFUL!')
    console.log('Database Time:', result[0].now)
  } catch (err) {
    console.error('❌ CONNECTION FAILED!')
    console.error('Error:', err.message)
    console.error('Code:', err.code)
  } finally {
    await sql.end()
    process.exit()
  }
}

testConnection()