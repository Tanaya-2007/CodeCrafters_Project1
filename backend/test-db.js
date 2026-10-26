const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

async function testConnection() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE
    });

    const [rows] = await connection.query('SELECT DATABASE() AS db');
    console.log('MySQL connected successfully:', rows[0].db);
  } catch (error) {
    console.error('Connection failed:', error.code || error.message);
  } finally {
    if (connection) await connection.end();
  }
}

testConnection();
