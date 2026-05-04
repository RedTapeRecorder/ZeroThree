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

module.exports = sql
