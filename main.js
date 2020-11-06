// load libraries
const express = require('express');
const handlebars = require('express-handlebars');
const mysql = require('mysql2/promise');
const morgan = require('morgan');

// configure environment
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;

// configure SQL
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'goodreads',
    // review again
    user: process.env.DB_USER || 'wilma',
    password: process.env.DB_PASSWORD || 'wilma',
    connectionLimit: 4,
    timezone: '+08:00'
})

// SQL Statements
const SQL_GET_BOOK_LIST = 'SELECT book_id, title FROM book2018 WHERE left(title,1) = ? ORDER BY title LIMIT ? OFFSET ?';
const SQL_GET_BOOK_COUNT = 'SELECT count(book_id) as bookcount FROM book2018 WHERE left(title,1) = ?';

// configure API

// create an express instance
const app = express ();

// configure morgan
// app.use(morgan('combined'));

// configure handlebars
app.engine('hbs', handlebars({defaultLayout: 'default.hbs'}));
app.set('view engine', 'hbs');

// configure routes
app.get('/', (req, res) => {
    const letterArray = 'ABCDEFGHIJKLMNOPQRSTUWXYZ'.split('');
    const numberArray = '0123456789'.split('');

    res.status(200);
    res.type('text/html');
    res.render('index', {
        letterArray, numberArray
    });
})

app.get('/booklist', async (req, res) => {

    const startLetter = req.query['q'];
    const offset = parseInt(req.query['offset']) || 0;
    const limit = 10;
    const nextOffset = offset + limit;
    const prevOffset = offset - limit;

    const conn = await pool.getConnection();

    try {
        const results = await conn.query(SQL_GET_BOOK_LIST,[startLetter, limit, offset]);

        const bookCount = await conn.query(SQL_GET_BOOK_COUNT,[startLetter]);

        const totalCount = bookCount[0][0].bookcount
        const isFirstPage = offset <= 0;
        const isLastPage = (offset + limit) >= totalCount

        // review again
        if (results[0].length <= 0) {
            res.status(200);
            res.type('text/html');
            res.render('noresult');
            return;
        }

        res.status(200);
        res.type('text/html');
        res.render('booklist', {
            isFirstPage, isLastPage, nextOffset, prevOffset,
            letter: startLetter,
            recs: results[0]
        });

    } catch (e) {
        res.status(500);
        res.type('text/html');
        res.send(JSON.stringify(e));
        return

    } finally {
        conn.release();
    }

})

// load static resources
app.use(express.static(__dirname + '/public'));

// start the application
pool.getConnection()
    .then(conn => {
        console.info(`Pinging database...`);
        const p0 = Promise.resolve(conn);
        const p1 = conn.ping();
        return Promise.all([p0, p1]);
    })
    .then(results => {
        const conn = results[0];

        // release the connection
        conn.release();

        // start the app
        app.listen(PORT, () => {
            console.log(`Application initialized on PORT: ${PORT} at ${new Date()}`);
        })
    })
    .catch (e => {
        console.error(`Cannot ping database: ${e}`);
    });