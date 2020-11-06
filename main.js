// Load Libraries
const express = require('express');
const handlebars = require('express-handlebars');
const mysql = require('mysql2/promise');
const withQuery = require('with-query').default;
const fetch = require('node-fetch');
const morgan = require('morgan');

// Configure Environment
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000;

// Configure SQL
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'goodreads',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: 4,
    timezone: '+08:00'
});

// SQL Statements
const SQL_GET_BOOK_LIST = 'SELECT book_id, title FROM book2018 WHERE left(title,1) = ? ORDER BY title LIMIT ? OFFSET ?';
const SQL_GET_BOOK_COUNT = 'SELECT count(book_id) as bookcount FROM book2018 WHERE left(title,1) = ?';
const SQL_GET_BOOK_DETAILS = 'SELECT * FROM book2018 where book_id = ?'

// Configure NYTimes API
const baseUrl = 'https://api.nytimes.com/svc/books/v3/reviews.json';
const APIKEY = process.env.APIKEY;

// Create an Express Instance
const app = express ();

// Configure Morgan
app.use(morgan('combined'));

// Configure Handlebars
app.engine('hbs', handlebars({defaultLayout: 'default.hbs'}));
app.set('view engine', 'hbs');

// Configure Routes

app.get('/', (req, res) => {
    const letterArray = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const numberArray = '0123456789'.split('');

    res.status(200);
    res.type('text/html');
    res.render('index', {
        letterArray, numberArray
    });
})

app.get('/list', async (req, res) => {

    const startLetter = req.query['q'];
    const offset = parseInt(req.query['offset']) || 0;
    const limit = 10;
    const nextOffset = offset + limit;
    const prevOffset = offset - limit;

    const conn = await pool.getConnection();

    console.info(`Request Book List for Letter : ${startLetter}`);

    try {
        const bookCount = await conn.query(SQL_GET_BOOK_COUNT,[startLetter]);

        const totalCount = bookCount[0][0].bookcount;
        const isFirstPage = offset <= 0;
        const isLastPage = (offset + limit) >= totalCount;

        const results = await conn.query(SQL_GET_BOOK_LIST,[startLetter, limit, offset]);

        if (results[0].length <= 0) {
            res.status(404);
            res.type('text/html');
            res.render('nobook', {
                letter: startLetter
            });
            return;
        }

        res.status(200);
        res.type('text/html');
        res.render('list', {
            isFirstPage, isLastPage, nextOffset, prevOffset,
            letter: startLetter,
            recs: results[0],
            totalCount
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

app.get('/details/:bookid', async (req, res) => {

    const bookId = req.params.bookid;

    const conn = await pool.getConnection();

    console.info(`Request Details for : ${bookId}`);

    try {
        const results = await conn.query(SQL_GET_BOOK_DETAILS,[bookId]);
        const recs = results[0];
        
        if (recs.length <= 0) {
            res.status(404)
            res.type('text/html')
            res.send(`Not found: ${bookId}`)
            return
        }

        const genres = recs[0].genres.split('|');
        const authors = recs[0].authors.split('|');

        res.format({
            'text/html': () => {
                res.status(200);
                res.render('details', {
                    genres, authors,
                    book: recs[0]
                });
            },
            'application/json': () => {
                const data = {
                    bookId: recs[0].book_id,
                    title: recs[0].title,
                    authors: authors,
                    summary: recs[0].description,
                    pages: recs[0].pages,
                    rating: recs[0].rating,
                    ratingCount: recs[0].rating_count,
                    genre: genres
                }
                
                res.json(data);
            },
            default: () => {
                res.status(406)
                res.type('text/plain')
                res.send(`Not supported: ${req.get("Accept")}`)
            }
        })

    } catch (e) {
        res.status(500);
        res.type('text/html');
        res.send(JSON.stringify(e));
        return

    } finally {
        conn.release();
    }

})

app.get('/reviews/:title', async (req, res) => {

    const bookTitle = req.params.title;

    const url = withQuery(baseUrl, {
        'api-key': APIKEY,
        title: bookTitle
    })

    console.info(`Request Reviews for : ${bookTitle}`);

    fetch(url)
        .then(res => res.json())
        .then(json => {

            if (json.num_results <= 0) {
                res.status(404);
                res.type('text/html');
                res.render('noreview', {
                    bookTitle
                });
                return;
            }

            res.status(200);
            res.type('text/html');
            res.render('reviews', {
                reviews: json.results,
                copyright: json.copyright
            });

        })
        .catch(e => {
            res.status(500);
            res.type('text/html');
            res.send(JSON.stringify(e));
            return
        })

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