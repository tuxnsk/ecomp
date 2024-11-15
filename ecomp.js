const https = require('https');
const fs = require('fs');
const prom = require('util').promisify;
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();

const fsReadFile = prom(fs.readFile);

const log = console.log;

process.on('uncaughtException', (err) => {
	log('ERR:', err.stack);
});

process.on('unhandledRejection', (reason, p) => {
	log('REJ:', reason.stack);
});

const db_name = 'db.sqlite';
const db = new sqlite3.Database(db_name, err => {
	if (err) return console.error(err.message);
	
	log('db connected');
});

function dbAll(sql, arg = []) {
	return new Promise(res => {
		db.all(sql, arg, (err, rows) => {
			if (err) return console.error(err.message);
			
			res(rows);
		});
	});
}

function dbGet(sql, arg) {
	return new Promise(res => {
		db.get(sql, arg, (err, row) => {
			if (err) return console.error(err.message);
			
			res(row);
		});
	});
}

function dbRun(sql, arg) {
	return new Promise(res => {
		db.get(sql, arg, (err) => {
			if (err) return console.error(err.message);
			
			res();
		});
	});
}

/*
const sql_create = `INSERT INTO Books (Book_ID, Title, Author, Comments) VALUES
(1, 'Mrs. Bridge', 'Evan S. Connell', 'First in the serie'),
(2, 'Mr. Bridge', 'Evan S. Connell', 'Second in the serie'),
(3, 'L''ingénue libertine', 'Colette', 'Minne + Les égarements de Minne');`;

db.run(sql_create, err => {
  if (err) {
    return console.error(err.message);
  }
  console.log("Successful creation of the 'Books' table");
});
*/
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false }));

app.get('/', (req, res) => {
	//res.send('Hello World!');
	res.render('index');
});
/*
app.get('/bom', (req, res) => {
	res.render('bom');
});
*/
/*
app.get("/about", (req, res) => {
  res.render("about");
});

app.get("/data", (req, res) => {
  const test = {
    title: "Test",
    items: ["one", "two", "three"]
  };
  res.render("data", { model: test });
});
*/

// =====================================================================

function hlDescr(rowList) {
	
	for (let row of rowList) {
		let ret = [];
		
		for (let line of row.descr.split('\n')) {
			if (line.substr(0, 4) == 'http') {
				ret.push('<a href="' + line + '">' + line + '</a>');
			} else {
				ret.push(line);
			}
		}
		
		row.descr = ret.join('<br>');
	}
}

app.get('/comp/', (req, res) => {
	
	let page = req.query.page || 1;
	let prevPage = parseInt(req.query.prevPage);
	
	if (isNaN(parseInt(page))) {
		if (page.charCodeAt(0) == 171) { // &laquo;
			page = prevPage - 1;
		} else if (page.charCodeAt(0) == 187) { // &raquo;
			page = prevPage + 1;
		}
	}
	
	page = parseInt(page);
	
	let query = '';
	if (req.query.search) {
		let qs = req.query.search;
		let qsl = req.query.search.toLowerCase();
		//log('qs', qs);
		
		query = "WHERE LOWER(co.name) LIKE '%" + qsl + "%' "
			+ "OR LOWER(co.descr) LIKE '%" + qsl + "%' "
			+ "OR co.name LIKE '%" + qs + "%' "
			+ "OR co.descr LIKE '%" + qs + "%' "
			+ "OR t.name LIKE '%" + qs + "%' "
			+ "OR p.name LIKE '%" + qs + "%'";
	}
	
	let rowCnt = req.query.rowCnt;
	
	if (rowCnt === undefined) rowCnt = 50;
	else rowCnt = parseInt(rowCnt);
	
	let limit = '';
	if (rowCnt) limit = 'LIMIT ' + rowCnt;
	
	let offset = '';
	if (page > 1) offset = 'OFFSET ' + (rowCnt * (page - 1));
	
	let pageList = [ 1, 2, 3 ];
	
	if (page > 2) {
		pageList = [];
		
		for (let i = page - 1; i <= page + 1; i++) pageList.push(i);
	}
	
	let sort = req.query.sort || 'id_desc';
	
	let order = 'ORDER BY ';
	switch (sort) {
	case 'id_desc':
		order += 'co.id DESC';
		break;
	case 'id_asc':
		order += 'co.id ASC';
		break;
	case 'name_desc':
		order += 'co.name DESC';
		break;
	case 'name_asc':
		order += 'co.name ASC';
		break;
	}
	
	const sql = `
SELECT co.id AS id,
co.name AS name,
t.name AS type,
p.name AS pack,
co.descr AS descr,
IFNULL(SUM(ce.cnt), 0) AS cnt
FROM comp co
INNER JOIN ftype t ON co.type = t.id
INNER JOIN pack p ON co.pack = p.id
LEFT JOIN cell ce ON co.id = ce.comp
${query}
GROUP BY co.id
${order}
${limit}
${offset}
;
`;
	
	db.all(sql, [], (err, rows) => {
		if (err) {
			return console.error(err.message);
		}
			
		hlDescr(rows);
		
		res.render('comp/index', {
			model: {
				rows,
				search: req.query.search,
				rowCnt,
				page,
				prevPage: page,
				pageList,
				sort
			}
		});
	});
});

app.get('/comp/add', (req, res) => {
	db.all("SELECT * FROM ftype ORDER BY name;", [], (err, rows) => {
		if (err) return console.error(err.message);
		
		let typeList = rows;
		
		db.all("SELECT * FROM pack ORDER BY name;", [], (err, rows) => {
			if (err) return console.error(err.message);
			
			let packList = rows;
			
			res.render('comp/add', { model: {
				typeList,
				packList
			} });
		});
	});
});

app.post('/comp/add', (req, res) => {
	const sql = "INSERT INTO comp (name, pack, descr, type) VALUES (?, ?, ?, ?);";
	const arg = [ req.body.name, req.body.pack, req.body.descr, req.body.type ];
	
	db.run(sql, arg, err => {
		res.redirect('/comp/');
	});
});

app.get('/comp/edit/:id', async (req, res) => {
	const id = req.params.id;
	
	let typeList = await dbAll("SELECT * FROM ftype ORDER BY name;");
	let packList = await dbAll("SELECT * FROM pack ORDER BY name;");
	let cell = await dbAll(`
SELECT o.id AS id,
o.name AS name,
IFNULL(ce.cnt, 0) AS cnt,
IFNULL(ce.place, '') AS place
FROM owner o
LEFT JOIN cell ce ON ce.owner = o.id AND ce.comp = ?
;`, [ id ]);
	
	let row = await dbGet("SELECT * FROM comp WHERE id = ?;", id);
	
	res.render('comp/edit', { model: {
		typeList,
		packList,
		cell,
		d: row
	} });
});

app.post('/comp/edit/:id', async (req, res) => {
	const id = req.params.id;
	let arg = [ req.body.name, req.body.pack, req.body.descr, req.body.type, id ];
	let sql = "UPDATE comp SET name = ?, pack = ?, descr = ?, type = ? WHERE (id = ?);";
	
	await dbRun(sql, arg);
	
	for (let argName in req.body) {
		if (argName.substr(0, 4) != 'cnt_') continue;
		
		let cnt = req.body[argName];
		let ownerId = parseInt(argName.split('_')[1]);
		let place = req.body['place_' + ownerId];
		
		sql = "SELECT COUNT(id) AS isExist FROM cell WHERE comp = ? AND owner = ?;";
		arg = [ id, ownerId ];
		let isExist = (await dbGet(sql, arg)).isExist;
		
		if (isExist) {
			arg = [ cnt, place, id, ownerId ];
			sql = "UPDATE cell SET cnt = ?, place = ? WHERE comp = ? AND owner = ?;"
		} else {
			arg = [ id, ownerId, cnt, place ];
			sql = "INSERT INTO cell (comp, owner, cnt, place) VALUES (?, ?, ?, ?);"
		}
		
		//log('arg', arg);
		await dbRun(sql, arg);
		
		//log('argName', argName, ownerId, cnt, isExist);
	}
	
	res.redirect('/comp/');
});

app.get('/comp/del/:id', (req, res) => {
	const id = req.params.id;
	const sql = "SELECT * FROM comp WHERE id = ?;";
	
	db.get(sql, id, (err, row) => {
		res.render('owner/del', { model: row });
	});
});

app.post('/comp/del/:id', (req, res) => {
	const id = req.params.id;
	const sql = 'DELETE FROM comp WHERE id = ?;';
	
	db.run(sql, id, err => {
		res.redirect('/comp/');
	});
});

// =====================================================================

app.get('/owner/', (req, res) => {
	const sql = "SELECT * FROM owner;";
	
	db.all(sql, [], (err, rows) => {
		if (err) {
			return console.error(err.message);
		}
		
		res.render('owner/index', { model: rows });
	});
});

app.get('/owner/add', (req, res) => {
	res.render('owner/add', { model: {} });
});

app.post('/owner/add', (req, res) => {
	const sql = "INSERT INTO owner (name) VALUES (?);";
	const arg = [ req.body.name ];
	
	db.run(sql, arg, err => {
		res.redirect('/owner/');
	});
});

app.get('/owner/edit/:id', (req, res) => {
	const id = req.params.id;
	const sql = "SELECT * FROM owner WHERE id = ?;";
	
	db.get(sql, id, (err, row) => {
		res.render('owner/edit', { model: row });
	});
});

app.post('/owner/edit/:id', (req, res) => {
	const id = req.params.id;
	const arg = [ req.body.name, id ];
	const sql = "UPDATE owner SET name = ? WHERE (id = ?);";
	
	db.run(sql, arg, err => {
		res.redirect('/owner/');
	});
});

app.get('/owner/del/:id', (req, res) => {
	const id = req.params.id;
	const sql = "SELECT * FROM owner WHERE id = ?;";
	
	db.get(sql, id, (err, row) => {
		res.render('owner/del', { model: row });
	});
});

app.post('/owner/del/:id', (req, res) => {
	const id = req.params.id;
	const sql = 'DELETE FROM owner WHERE id = ?;';
	
	db.run(sql, id, err => {
		res.redirect('/owner/');
	});
});

// =====================================================================

app.get('/pack/', (req, res) => {
	const sql = `
SELECT p.id AS id,
p.name AS name,
COUNT(co.id) AS cnt
FROM pack p
LEFT JOIN comp co ON co.pack = p.id
GROUP BY p.id
ORDER BY p.name;
`;
	
	db.all(sql, [], (err, rows) => {
		if (err) {
			return console.error(err.message);
		}
		
		res.render('pack/index', { model: rows });
	});
});

app.get('/pack/add', (req, res) => {
	res.render('pack/add', { model: {} });
});

app.post('/pack/add', (req, res) => {
	const sql = "INSERT INTO pack (name) VALUES (?);";
	const arg = [ req.body.name ];
	
	db.run(sql, arg, err => {
		res.redirect('/pack/');
	});
});

app.get('/pack/edit/:id', (req, res) => {
	const id = req.params.id;
	const sql = "SELECT * FROM pack WHERE id = ?;";
	
	db.get(sql, id, (err, row) => {
		res.render('pack/edit', { model: row });
	});
});

app.post('/pack/edit/:id', (req, res) => {
	const id = req.params.id;
	const arg = [ req.body.name, id ];
	const sql = "UPDATE pack SET name = ? WHERE (id = ?);";
	
	db.run(sql, arg, err => {
		res.redirect('/pack/');
	});
});

app.get('/pack/del/:id', (req, res) => {
	const id = req.params.id;
	const sql = "SELECT * FROM pack WHERE id = ?;";
	
	db.get(sql, id, (err, row) => {
		res.render('pack/del', { model: row });
	});
});

app.post('/pack/del/:id', (req, res) => {
	const id = req.params.id;
	const sql = 'DELETE FROM pack WHERE id = ?;';
	
	db.run(sql, id, err => {
		res.redirect('/pack/');
	});
});

// =====================================================================

app.get('/type/', (req, res) => {
	const sql = "SELECT * FROM ftype ORDER BY name;";
	
	db.all(sql, [], (err, rows) => {
		if (err) {
			return console.error(err.message);
		}
		
		res.render('type/index', { model: rows });
	});
});

app.get('/type/add', (req, res) => {
	res.render('type/add', { model: {} });
});

app.post('/type/add', (req, res) => {
	const sql = "INSERT INTO ftype (name) VALUES (?);";
	const arg = [ req.body.name ];
	
	db.run(sql, arg, err => {
		res.redirect('/type/');
	});
});

app.get('/type/edit/:id', (req, res) => {
	const id = req.params.id;
	const sql = "SELECT * FROM ftype WHERE id = ?;";
	
	db.get(sql, id, (err, row) => {
		res.render('type/edit', { model: row });
	});
});

app.post('/type/edit/:id', (req, res) => {
	const id = req.params.id;
	const arg = [ req.body.name, id ];
	const sql = "UPDATE ftype SET name = ? WHERE (id = ?);";
	
	db.run(sql, arg, err => {
		res.redirect('/type/');
	});
});

app.get('/type/del/:id', (req, res) => {
	const id = req.params.id;
	const sql = "SELECT * FROM ftype WHERE id = ?;";
	
	db.get(sql, id, (err, row) => {
		res.render('type/del', { model: row });
	});
});

app.post('/type/del/:id', (req, res) => {
	const id = req.params.id;
	const sql = 'DELETE FROM ftype WHERE id = ?;';
	
	db.run(sql, id, err => {
		res.redirect('/type/');
	});
});

// =====================================================================

app.get('/bom/', (req, res) => {
	const sql = "SELECT * FROM bom ORDER BY name;";
	
	db.all(sql, [], (err, rows) => {
		if (err) {
			return console.error(err.message);
		}
		
		res.render('bom/index', { model: rows });
	});
});

app.get('/bom/add', (req, res) => {
	res.render('bom/add', { model: {} });
});

app.post('/bom/add', (req, res) => {
	const sql = "INSERT INTO bom (name, body) VALUES (?, ?);";
	const arg = [ req.body.name, req.body.body ];
	
	db.run(sql, arg, err => {
		res.redirect('/bom/');
	});
});

app.get('/bom/edit/:id', (req, res) => {
	const id = req.params.id;
	const sql = "SELECT * FROM bom WHERE id = ?;";
	
	db.get(sql, id, (err, row) => {
		res.render('bom/edit', { model: row });
	});
});

app.post('/bom/edit/:id', (req, res) => {
	const id = req.params.id;
	const arg = [ req.body.name, req.body.body, id ];
	const sql = "UPDATE bom SET name = ?, body = ? WHERE (id = ?);";
	
	db.run(sql, arg, err => {
		res.redirect('/bom/');
	});
});

app.get('/bom/del/:id', (req, res) => {
	const id = req.params.id;
	const sql = "SELECT * FROM bom WHERE id = ?;";
	
	db.get(sql, id, (err, row) => {
		res.render('bom/del', { model: row });
	});
});

app.post('/bom/del/:id', (req, res) => {
	const id = req.params.id;
	const sql = 'DELETE FROM bom WHERE id = ?;';
	
	db.run(sql, id, err => {
		res.redirect('/bom/');
	});
});

app.get('/bom/link/:id', async (req, res) => {
	const id = req.params.id;
	const sql = "SELECT * FROM bom WHERE id = ?;";
	
	let row = await dbGet("SELECT * FROM bom WHERE id = ?;", id);
	
	let bom = [];
	
	let sBody = row.body.split('\n');
	for (let i in sBody) {
		i = parseInt(i);
		
		if (!i) continue;
		
		let brow = sBody[i];
		brow = brow.trim();
		
		if (!brow) continue;
		
		brow = brow.substr(1);
		brow = brow.substr(0, brow.length -1);
		
		let sRow = brow.split('","');
		log('sRow', sRow);
		
		let type = sRow[0].split(',').pop();
		type = type.replace(/\d+/g, '');
		
		bom.push({
			type,
			comp: sRow[1],
			pack: sRow[2],
			cnt: sRow[3]
		});
	}
	
	res.render('bom/link', { model: {
		bom
	}});
});

// =====================================================================

/*
app.get("/edit/:id", (req, res) => {
  const id = req.params.id;
  const sql = "SELECT * FROM Books WHERE Book_ID = ?";
  db.get(sql, id, (err, row) => {
    // if (err) ...
    res.render("edit", { model: row });
  });
});

app.post("/edit/:id", (req, res) => {
	
	//log('req.body', Object.keys(req));
	
  const id = req.params.id;
  const book = [req.body.Title, req.body.Author, req.body.Comments, id];
  const sql = "UPDATE Books SET Title = ?, Author = ?, Comments = ? WHERE (Book_ID = ?)";
  db.run(sql, book, err => {
    // if (err) ...
    res.redirect("/books");
  });
});

app.get("/create", (req, res) => {
  res.render("create", { model: {} });
});

app.post("/create", (req, res) => {
  const sql = "INSERT INTO Books (Title, Author, Comments) VALUES (?, ?, ?)";
  const book = [req.body.Title, req.body.Author, req.body.Comments];
  db.run(sql, book, err => {
    // if (err) ...
    res.redirect("/books");
  });
});

app.get("/delete/:id", (req, res) => {
  const id = req.params.id;
  const sql = "SELECT * FROM Books WHERE Book_ID = ?";
  db.get(sql, id, (err, row) => {
    // if (err) ...
    res.render("delete", { model: row });
  });
});

app.post("/delete/:id", (req, res) => {
  const id = req.params.id;
  const sql = "DELETE FROM Books WHERE Book_ID = ?";
  db.run(sql, id, err => {
    // if (err) ...
    res.redirect("/books");
  });
});
*/



async function main() {
		
	const port = 3080;
	
	let httpsOpt = {
		key: await fsReadFile('/etc/letsencrypt/live/lk.sinlab.ru/privkey.pem'),
		cert: await fsReadFile('/etc/letsencrypt/live/lk.sinlab.ru/fullchain.pem')
	};
	
	/*
	app.listen(port, () => {
		log(`Server listening on port ${port}`);
	});
	*/
	https.createServer(httpsOpt, app).listen(port);
}

main();

