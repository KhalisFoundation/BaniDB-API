const banidb = require('@sttm/banidb');
const anvaad = require('anvaad-js');
const lib = require('../lib');

const sources = banidb.SOURCES;
const searchTypes = banidb.TYPES;

const allColumns = `v.ID, v.Gurmukhi, v.GurmukhiUni, v.Translations, v.PageNo AS PageNo, v.LineNo,
    v.SourceID as SourceID, s.ShabadID, v.FirstLetterStr, v.MainLetters, v.Visraam,
    v.FirstLetterEng, v.Transliterations, v.WriterID, w.WriterEnglish,
    w.WriterGurmukhi, w.WriterUnicode, v.RaagID, r.RaagGurmukhi,
    r.RaagUnicode, r.RaagEnglish, r.RaagWithPage,
    src.SourceGurmukhi, src.SourceUnicode, src.SourceEnglish,
    GREATEST(s.Updated, v.Updated) AS Updated`;

const liveColumns = `v.ID, v.Gurmukhi, v.GurmukhiUni, v.Translations, s.ShabadID`;

const allFrom = `FROM Verse v
  LEFT JOIN Shabad s ON s.VerseID = v.ID
  LEFT JOIN Writer w USING(WriterID)
  LEFT JOIN Raag r USING(RaagID)
  LEFT JOIN Source src USING(SourceID)`;

const allColumnsWhere = 'AND s.ShabadID < 5000000';

exports.search = async (req, res) => {
  let searchQuery = req.params.query;
  let SourceID = req.query.source || '';
  let searchType = req.query.searchtype ? parseInt(req.query.searchtype, 10) : 0;
  let writer = parseInt(req.query.writer, 10) || null;
  let raag = parseInt(req.query.raag, 10) || null;
  let ang = parseInt(req.query.ang, 10) || null;
  let page = parseInt(req.query.page, 10) || 0;
  let results = parseInt(req.query.results, 10) || 20;
  const sinceDate = req.query.updatedsince ? lib.isValidDatetime(req.query.updatedsince) : null;
  const liveSearch = req.query.livesearch ? parseInt(req.query.livesearch, 10) : 0;

  SourceID = SourceID.substr(0, 1);

  if (!searchTypes[searchType]) {
    searchType = 0;
  }

  if (writer < 0) {
    writer = 0;
  }

  if (raag < 0) {
    raag = 0;
  }

  if (ang < 0) {
    ang = 0;
  }

  if (page < 1) {
    page = 1;
  }

  if (results < 1) {
    results = 20;
  }

  let columns = liveSearch === 1 ? `${liveColumns} ${allFrom}` : `${allColumns} ${allFrom}`;

  let charCodeQuery = '';
  let charCodeQueryWildCard = '';
  const conditions = [];
  const parameters = [];
  let groupBy = '';
  let orderBy = '';

  // only do for first letter searches
  if (searchType === 0 || searchType === 1) {
    // ignore spaces
    searchQuery = searchQuery.replace(/\s+/g, '');

    // convert unicode to ascii
    searchQuery = anvaad.unicode(searchQuery, true);

    for (let x = 0, len = searchQuery.length; x < len; x += 1) {
      let charCode = searchQuery.charCodeAt(x);
      // adding commas with the special characters make them harder to parse out, so just append them
      //  without having to worry about all that
      if (lib.searchOperators.DecSearchOperators.includes(charCode)) {
        charCodeQuery += searchQuery.charAt(x);
      } else {
        if (charCode < 100) {
          charCode = `0${charCode}`;
        }
        charCodeQuery += `,${charCode}`;
      }
    }
    // Add trailing wildcard
    charCodeQueryWildCard = `${charCodeQuery},z`;
  }

  if (sources[SourceID]) {
    conditions.push('v.SourceID = ?');
    parameters.push(SourceID);
  }

  if (searchQuery) {
    if (searchType === 0) {
      // First letter start=> {
      // }
      const queryObj = lib.searchOperators.firstLetterStartToQuery(
        charCodeQuery,
        charCodeQueryWildCard,
      );
      conditions.push(queryObj.condition);
      parameters.push(...queryObj.parameters);

      if (searchQuery.length < 3) {
        orderBy = 'FirstLetterLen,';
      }
    } else if (searchType === 1) {
      // First letter anywhere
      const queryObj = lib.searchOperators.firstLetterAnywhereToQuery(
        charCodeQuery,
        charCodeQueryWildCard,
      );
      columns += queryObj.columns === undefined ? '' : queryObj.columns;
      conditions.push(queryObj.condition);
      parameters.push(...queryObj.parameters);

      groupBy = 'GROUP BY v.ID';
      if (searchQuery.length < 3) {
        orderBy = 'FirstLetterLen,';
      }
    } else if (searchType === 2) {
      // Full word (Gurmukhi)
      // convert unicode to ascii
      searchQuery = anvaad.unicode(searchQuery, true);

      const queryObj = lib.searchOperators.fullWordGurmukhiToQuery(searchQuery);
      conditions.push(queryObj.condition);
      parameters.push(...queryObj.parameters);

      groupBy = 'GROUP BY v.ID';
    } else if (searchType === 3) {
      // Full word (English)
      const queryObj = lib.searchOperators.fullWordEnglishToQuery(searchQuery);
      columns += queryObj.columns === undefined ? '' : queryObj.columns;

      conditions.push(queryObj.condition);
      parameters.push(...queryObj.parameters);

      groupBy = 'GROUP BY v.ID';
    } else if (searchType === 4) {
      const queryObj = lib.searchOperators.fullWordRomanizedToQuery(searchQuery);

      conditions.push(queryObj.condition);
      parameters.push(...queryObj.parameters);
    } else if (searchType === 5) {
      // Ang
      // Reserved for Ang search - ideally it should go to /angs
      conditions.push('v.PageNo = ?');
      parameters.push(searchQuery);
    } else if (searchType === 6) {
      // Main letters
      // convert unicode to ascii
      searchQuery = anvaad.unicode(searchQuery, true);
      const words = searchQuery.split(' ').join('%');

      const queryObj = lib.searchOperators.mainLettersToQuery(words);
      columns += queryObj.columns === undefined ? '' : queryObj.columns;

      conditions.push(queryObj.condition);
      parameters.push(...queryObj.parameters);
      groupBy = 'GROUP BY v.ID';
    } else if (searchType === 7) {
      // first letters english
      // ignore spaces
      searchQuery = searchQuery.replace(/\s+/g, '');
      searchQuery = searchQuery.toLowerCase();
      conditions.push('v.FirstLetterEng LIKE ?');
      parameters.push(`%${searchQuery}%`);
    }
  }

  if (writer > 0) {
    conditions.push('v.WriterID = ?');
    parameters.push(writer);
  }

  if (raag > 0) {
    conditions.push('v.RaagID = ?');
    parameters.push(raag);
  }

  if (ang > 0) {
    conditions.push('v.PageNo = ?');
    parameters.push(ang);
  }

  if (sinceDate) {
    conditions.push('v.Updated > ?');
    parameters.push(sinceDate);
  }

  let conn;

  try {
    conn = await req.app.locals.pool.getConnection();

    const q = `SELECT ${columns}
      WHERE ${conditions.join(' AND ')}
      ${groupBy}
      ORDER BY ${orderBy} ShabadID ASC`;

    const row = await conn.query(`SELECT COUNT(*) FROM (${q}) AS count`, parameters);

    const totalResults = row[0]['COUNT(*)'];
    const totalPages = Math.ceil(totalResults / results);
    if (page > totalPages) {
      page = totalPages;
    }
    const resultsInfo = {
      totalResults,
      pageResults: totalResults,
      pages: {
        page,
        resultsPerPage: results,
        totalPages,
      },
    };

    if (totalResults > 0) {
      if (page < totalPages) {
        req.query.page = page + 1;
        resultsInfo.pages.nextPage = `${req.protocol}://${req.get('host')}${req.baseUrl}${
          req.path
        }?${Object.keys(req.query)
          .map(key => `${key}=${encodeURIComponent(req.query[key])}`)
          .join('&')}`;
      }
      const rows = await conn.query(`${q} LIMIT ?, ?`, [
        ...parameters,
        (page - 1) * results,
        results,
      ]);
      const verses = rows.map(verse => lib.prepVerse(verse, true, liveSearch));
      resultsInfo.pageResults = verses.length;
      res.json({
        resultsInfo,
        verses,
      });
    } else {
      res.json({
        resultsInfo,
        verses: [],
      });
    }
  } catch (err) {
    lib.error(err, res, 500);
  } finally {
    if (conn) conn.end();
  }
};

exports.shabads = async (req, res) => {
  let { ShabadID } = req.params;
  const sinceDate = req.query.updatedsince ? lib.isValidDatetime(req.query.updatedsince) : null;

  if (lib.isListOfNumbers(ShabadID)) {
    ShabadID = ShabadID.split(/[,+]/g);
    try {
      const rows = await getShabad(req, res, ShabadID, sinceDate);
      if (Object.entries(rows).length === 0) {
        lib.error(
          'Shabad does not exist or no updates found for specified Shabad.',
          res,
          404,
          false,
        );
      } else {
        res.json(rows);
      }
    } catch (err) {
      lib.error(err, res, 500);
    }
  } else {
    lib.error('Malformed URL', res, 400, false);
  }
};

exports.angs = async (req, res) => {
  const { PageNo, SourceID } = req.params;
  const sinceDate = req.query.updatedsince ? lib.isValidDatetime(req.query.updatedsince) : null;

  try {
    const results = await getAngs(req, res, { pageNo: PageNo, sourceID: SourceID, sinceDate });
    if (results) {
      res.json(results);
    } else {
      lib.error('That ang does not exist or no updates found.', res, 404, false);
    }
  } catch (err) {
    lib.error(err, res, 500);
  }
};

exports.hukamnamas = async (req, res) => {
  let q;
  const output = {};
  const args = [];
  let exit = false;
  if (req.params.year && req.params.month && req.params.day) {
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);
    const day = parseInt(req.params.day, 10);
    const validDate = new Date(year, month - 1, day).getTime();
    const archiveDate = new Date(2002, 0, 1).getTime();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (validDate >= archiveDate && validDate <= tomorrow.getTime()) {
      q = 'SELECT ID as hukamDate, ShabadID FROM Hukamnama WHERE ID = ?';
      args.push(`${year}-${month}-${day}`);
    } else {
      lib.error('Please specify a valid date. Archives go back to 2002-01-01', res, 404, false);
      exit = true;
    }
  }
  if (!q) {
    q = 'SELECT ID as hukamDate, ShabadID FROM Hukamnama ORDER BY ID DESC LIMIT 1';
    output.isLatest = true;
  }
  if (!exit) {
    let conn;

    try {
      conn = await req.app.locals.pool.getConnection();
      const row = await conn.query(q, args);
      if (row.length > 0) {
        const { hukamDate } = row[0];
        const ShabadIDs = JSON.parse(row[0].ShabadID);
        const shabads = await getShabad(req, res, ShabadIDs, null, true);
        const hukamGregorianDate = new Date(hukamDate);
        const date = {
          gregorian: {
            month: hukamGregorianDate.getMonth() + 1,
            date: hukamGregorianDate.getDate(),
            year: hukamGregorianDate.getFullYear(),
          },
        };

        output.date = date;
        output.shabadIds = ShabadIDs;
        output.shabads = shabads.shabads ? shabads.shabads : shabads;

        res.cacheControl = { maxAge: 1800 };
        res.json(output);
      } else {
        lib.error('Hukamnama is missing for that date', res, 404, false);
      }
    } catch (err) {
      lib.error(err, res, 500);
    } finally {
      if (conn) conn.end();
    }
  }
};

exports.random = async (req, res) => {
  let { SourceID } = req.params;
  const params = [];
  let whereClause = '';
  // Check if SourceID is supported or default to 'G'
  if (!sources[SourceID]) {
    SourceID = 'G';
  }
  let conn;
  try {
    conn = await req.app.locals.pool.getConnection();

    if (SourceID !== 'all') {
      whereClause = 'WHERE v.SourceID = ?';
      params.push(SourceID);
    }
    const q = `SELECT DISTINCT s.ShabadID, v.PageNo FROM Shabad s JOIN Verse v ON s.VerseID = v.ID ${whereClause} ORDER BY RAND() LIMIT 1`;

    const row = await conn.query(q, params);
    const { ShabadID } = row[0];
    const rows = await getShabad(req, res, [ShabadID]);
    res.cacheControl = { noCache: true };
    res.json(rows);
  } catch (err) {
    lib.error(err, res, 500);
  } finally {
    if (conn) conn.end();
  }
};

const getShabad = (req, res, ShabadIDQ, sinceDate = null, forceMulti = false) =>
  new Promise((resolve, reject) => {
    req.app.locals.pool
      .getConnection()
      .then(conn => {
        const parameters = [...ShabadIDQ];
        const ShabadIDQLength = ShabadIDQ.length;
        const tokens = new Array(ShabadIDQLength).fill('?').join(',');

        let sinceQuery = '';
        if (sinceDate) {
          sinceQuery = 'AND GREATEST(s.Updated, v.Updated) > ?';
          parameters.push(sinceDate);
        }

        let multipleShabadOrder = '';
        if (ShabadIDQLength > 1) {
          multipleShabadOrder = `FIELD(ShabadID, ${tokens}),`;
          parameters.push(...ShabadIDQ);
        }

        const q = `SELECT ${allColumns}, sn.VerseID as ShabadName
                    ${allFrom} LEFT JOIN ShabadName sn USING(ShabadID)
                    WHERE s.ShabadID IN (${tokens}) ${allColumnsWhere} ${sinceQuery}
                    ORDER BY ${multipleShabadOrder} v.ID ASC`;

        conn
          .query(q, parameters)
          .then(async rows => {
            if (rows.length > 0 && ShabadIDQLength === 1 && forceMulti === false) {
              // single shabad
              const retShabad = await getShabadSingle(req, res, rows);
              resolve(retShabad);
            } else if (rows.length > 0) {
              // multiple shabads
              const output = {
                shabadIds: [],
                shabads: [],
              };
              let curShabadID = -1;
              let counter = 0;
              rows.forEach(row => {
                if (row.ShabadID !== curShabadID) {
                  curShabadID = row.ShabadID;
                  output.shabadIds.push(curShabadID);
                  counter = output.shabads.push([]) - 1;
                }
                output.shabads[counter].push(row);
              });

              const outputShabadPromises = output.shabads.map(row =>
                getShabadSingle(req, res, row),
              );
              output.shabads = await Promise.all(outputShabadPromises);
              resolve(output);
            } else {
              resolve({});
            }
            if (conn) conn.end();
          })
          .catch(err => reject(err));
      })
      .catch(err => reject(err));
  });

const getAngs = async (req, res, { pageNo, sinceDate, sourceID }) => {
  let PageNo = pageNo;
  let SourceID = sourceID;
  if (!lib.isRangeOfNumbers(PageNo)) {
    PageNo = '1';
  }

  // Check if SourceID is supported or default to 'G'
  if (!sources[SourceID]) {
    SourceID = 'G';
  }
  // If SGGS, check if within 1430
  if (SourceID === 'G' && PageNo > 1430) {
    PageNo = '1430';
  }

  const PageNoQuery = lib.searchOperators.angToQuery(PageNo);

  const parameters = [...PageNoQuery.parameters, SourceID];

  let sinceQuery = '';
  if (sinceDate) {
    sinceQuery = 'AND GREATEST(s.Updated, v.Updated) > ?';
    parameters.push(sinceDate);
  }

  let conn;
  let results = null;
  try {
    conn = await req.app.locals.pool.getConnection();
    const q = `SELECT ${allColumns} ${allFrom}
      WHERE
        ${PageNoQuery.q}
        AND v.SourceID = ?
        ${sinceQuery}
        ${allColumnsWhere}
      ORDER BY PageNo,v.LineNo ASC, ShabadID ASC, v.ID ASC`;

    const rows = await conn.query(q, parameters);
    if (rows.length > 0 && PageNoQuery.totalPages === 1) {
      // single ang
      const output = await getAngSingle(req, res, rows);
      results = output;
    } else if (rows.length > 0) {
      // multiple ang
      const output = {
        pageNos: [],
        pages: [],
      };
      let curPage = -1;
      let counter = 0;
      rows.forEach(row => {
        if (row.PageNo !== curPage) {
          curPage = row.PageNo;
          output.pageNos.push(curPage);
          counter = output.pages.push([]) - 1;
        }
        output.pages[counter].push(row);
      });

      const outputPagePromises = output.pages.map(row => getAngSingle(req, res, row));
      output.pages = await Promise.all(outputPagePromises);
      results = output;
    }
    return results;
  } catch (e) {
    throw e;
  } finally {
    if (conn) conn.end();
  }
};

// for graphql
exports.getShabad = getShabad;
exports.getAngs = getAngs;

const getAngSingle = async (req, res, rows) => {
  const { PageNo, SourceID } = rows[0];
  const source = lib.getSource(rows[0]);
  const count = rows.length;
  const page = rows.map(row => {
    const rowData = lib.prepVerse(row);
    rowData.writer = lib.getWriter(row);
    rowData.raag = lib.getRaag(row);
    return rowData;
  });

  const navigation = await getNavigation(req, res, 'ang', PageNo, PageNo, SourceID);

  return {
    source,
    count,
    navigation,
    page,
  };
};

const getShabadSingle = async (req, res, rows) => {
  const shabadInfo = lib.getShabadInfo(rows[0], rows);
  const verses = rows.map(lib.prepVerse);
  const navigation = await getNavigation(req, res, 'shabad', rows[0].ID, rows[rows.length - 1].ID);

  return {
    shabadInfo,
    count: verses.length,
    navigation,
    verses,
  };
};

const getNavigation = async (req, res, type, first, last, source = '') => {
  let conn;
  let table = 'Verse';
  let column = '';
  let where = '';
  let columnWhere = '';
  let parameters = [first, last];

  if (type === 'shabad') {
    table = 'Shabad';
    column = 'ShabadID';
    columnWhere = 'VerseID';
  } else if (type === 'ang') {
    column = 'PageNo';
    parameters = [first, source, last, source];
    columnWhere = column;
    where = 'AND SourceID = ?';
  } else {
    return false;
  }

  try {
    conn = await req.app.locals.pool.getConnection();
    const q1 = `(SELECT 'previous' as navigation, ${column}
                  FROM ${table}
                  WHERE ${columnWhere} < ? ${where}
                  ORDER BY ${columnWhere} DESC LIMIT 1)
                UNION
                (SELECT 'next' as navigation, ${column}
                  FROM ${table}
                  WHERE ${columnWhere} > ? ${where}
                  ORDER BY ${columnWhere} LIMIT 1);`;
    const rows1 = await conn.query(q1, parameters);
    let previous = null;
    let next = null;
    rows1.forEach(row => {
      if (row.navigation === 'previous') {
        previous = row[column];
      }
      if (row.navigation === 'next') {
        next = row[column];
      }
    });

    return {
      previous,
      next,
    };
  } catch (err) {
    lib.error(err, res, 500);
  } finally {
    if (conn) conn.end();
  }
  return {};
};

exports.updates = async (req, res) => {
  let conn;
  const { Date } = req.params;

  try {
    conn = await req.app.locals.pool.getConnection();

    if (!Date) res.json({ error: 'please enter valid date' });
    const query = `SELECT COUNT(*) FROM Verse WHERE Updated >= '${Date}'`;

    const dbCount = await conn.query(query);

    res.json({ updatedVerses: dbCount[0]['COUNT(*)'] });
  } catch (err) {
    lib.error(err, res, 500);
  } finally {
    if (conn) conn.end();
  }
};
