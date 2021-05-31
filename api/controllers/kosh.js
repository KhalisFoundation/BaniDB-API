const lib = require('../lib');

exports.letter = async (req, res) => {
  let conn;
  const letter = req.params.Letter;
  if (letter.length !== 1) {
    lib.error(
      'You must supply a single character to see the index for that letter.',
      res,
      422,
      false,
    );
  }
  try {
    conn = await req.app.locals.pool.getConnection();
    const q = `SELECT ID AS id, Word AS word, WordUni AS wordUni
                FROM MahanKoshWords
                WHERE FirstLetter=? OR FirstLetterUni=?
                ORDER BY ID`;
    const rows = await conn.query(q, [letter, letter]);
    res.json(rows);
  } catch (err) {
    lib.error(err, res, 500);
  } finally {
    if (conn) conn.end();
  }
};

exports.word = async (req, res) => {
  let conn;
  const word = `${req.params.Word}`;
  try {
    conn = await req.app.locals.pool.getConnection();
    const q = `SELECT w.ID AS id, w.Word AS word, w.WordUni AS wordUni,
                  d.DefGurmukhi AS definition, d.DefGurmukhiUni AS definitionUni
                FROM MahanKoshWords w
                LEFT JOIN MahanKoshDefinitions d ON w.Definition = d.ID
                WHERE w.Word LIKE ? OR w.WordUni LIKE BINARY ? LIMIT 1`;
    const rows = await conn.query(q, [word, word]);
    res.json(rows);
  } catch (err) {
    lib.error(err, res, 500);
  } finally {
    if (conn) conn.end();
  }
};

exports.wordSearch = async (req, res) => {
  let conn;
  const query = `${req.params.query}`;
  const match = `%${query}%`;
  const fullMatch = `${query}`;
  const startMatch = `${query}%`;
  const endMatch = `%${query}`;
  try {
    conn = await req.app.locals.pool.getConnection();
    const q = `SELECT w.ID AS id, w.Word AS word, w.WordUni AS wordUni,
                  d.DefGurmukhi AS definition, d.DefGurmukhiUni AS definitionUni
                FROM MahanKoshWords w
                LEFT JOIN MahanKoshDefinitions d ON w.Definition = d.ID
                WHERE
                  w.Word LIKE ? OR
                  w.WordUni LIKE BINARY ?
                ORDER BY 
                  CASE
                    WHEN word LIKE ? THEN 1
                    WHEN wordUni LIKE ? THEN 1
                    WHEN word LIKE ? THEN 2
                    WHEN wordUni LIKE ? THEN 2
                    WHEN word LIKE ? THEN 3
                    WHEN wordUni LIKE ? THEN 3
                    ELSE 4
                  END`;
    const rows = await conn.query(q, [
      match,
      match,
      fullMatch,
      fullMatch,
      startMatch,
      startMatch,
      endMatch,
      endMatch,
    ]);
    res.json(rows);
  } catch (err) {
    lib.error(err, res, 500);
  } finally {
    if (conn) conn.end();
  }
};

exports.search = async (req, res) => {
  let conn;
  const query = `${req.params.query}`;
  const match = `%${query}%`;
  const fullMatch = `${query}`;
  const startMatch = `${query}%`;
  const endMatch = `%${query}`;
  try {
    conn = await req.app.locals.pool.getConnection();
    const q = `SELECT w.ID AS id, w.Word AS word, w.WordUni AS wordUni,
                  d.DefGurmukhi AS definition, d.DefGurmukhiUni AS definitionUni
                FROM MahanKoshWords w
                LEFT JOIN MahanKoshDefinitions d ON w.Definition = d.ID
                WHERE
                  w.Word LIKE ? OR
                  w.WordUni LIKE BINARY ? OR
                  d.DefGurmukhi LIKE ? OR
                  d.DefGurmukhiUni LIKE BINARY ?
                ORDER BY 
                  CASE
                    WHEN word LIKE ? THEN 1
                    WHEN wordUni LIKE ? THEN 1
                    WHEN word LIKE ? THEN 2
                    WHEN wordUni LIKE ? THEN 2
                    WHEN word LIKE ? THEN 3
                    WHEN wordUni LIKE ? THEN 3
                    WHEN definition LIKE ? THEN 4
                    WHEN definitionUni LIKE ? THEN 4
                    WHEN definition LIKE ? THEN 5
                    WHEN definitionUni LIKE ? THEN 5
                    WHEN definition LIKE ? THEN 6
                    WHEN definitionUni LIKE ? THEN 6
                    ELSE 7
                  END`;
    const rows = await conn.query(q, [
      match,
      match,
      match,
      match,
      fullMatch,
      fullMatch,
      startMatch,
      startMatch,
      endMatch,
      endMatch,
      fullMatch,
      fullMatch,
      startMatch,
      startMatch,
      endMatch,
      endMatch,
    ]);
    res.json(rows);
  } catch (err) {
    lib.error(err, res, 500);
  } finally {
    if (conn) conn.end();
  }
};
