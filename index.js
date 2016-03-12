#!/usr/bin/env node
/**
 * Created by groupsky on 26.02.16.
 */

var restify = require('restify');
var pkg = require('./package');

var server = restify.createServer({
    name: pkg.name,
    version: pkg.version
});
server.use(restify.acceptParser(server.acceptable));
server.use(restify.queryParser());
server.use(restify.bodyParser());

function search(sheet, name, maxcol, next) {
    sheet.getCells({
        'min-col': 1,
        'max-col': 1,
        'min-row': 3,
        'max-row': sheet.rowCount,
    }, function (err, cells) {
        if (err) {
            console.error('getCells error', err);
            return next(err);
        }

        var found = false;
        cells.forEach(function (cell) {
            var memberNames = cell.value.toLowerCase().split(/[\r\n|]/).forEach(function(name){
                return name.trim();
            });
            if (!~memberNames.indexOf(name.toLowerCase())) return;
            name = memberNames[0];

            found = true;
            console.log('got', cell.value.trim(), 'at row', cell.row);
            var row = cell.row;
            sheet.getCells({
                'min-col': 4,
                'max-col': maxcol,
                'min-row': row,
                'max-row': row
            }, function (err, cells) {
                var lastcol;
                var lastsum;
                var lastdate;
                cells.forEach(function (cell) {
                    if (cell.value && ((!lastcol) || (lastcol < cell.col))) {
                        lastcol = cell.col;
                        if (cell.col % 2)
                            lastdate = cell.value;
                        else
                            lastsum = cell.value;
                    }
                });
                console.log('last paid', Math.floor((lastcol - 4) / 2) + 1);
                if (lastcol) {
                    return next(null, {
                        name: name,
                        last_paid_month: Math.floor((lastcol - 4) / 2) + 1,
                        last_paid_sum: lastsum,
                        last_paid_date: lastdate
                    })
                }

                return next();
            });
        });

        if (!found) {
            return next();
        }
    });

}

server.get('/', function(req, res, next) {
    var body = '<html><body><form onsubmit="location.assign(\'/\'+document.getElementById(\'name\').value);return false;"><input id="name" placeholder="Вашето име"><button type="submit">Провери</button></form><!-- alive --></body></html>';
    res.writeHead(200, {
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'text/html'
    });
    res.write(body);
    res.end();
    return next();
});

server.get('/:name', function (req, res, next) {
    res.charSet('utf-8');
    var GoogleSpreadsheet = require("google-spreadsheet");
    var doc = new GoogleSpreadsheet('1yEmwTHsymobz6_xRGC6d8ZRT6v7sO3Qhzgud5dzNHME');

    // need to find the correct sheets
    var sheet2016, sheet2015;
    doc.getInfo(function (err, info) {
        if (err) {
            console.error('getInfo produced error', err);
            return next(err);
        }
        info.worksheets.forEach(function (sheet) {
            console.log('found sheet ' + sheet.title);
            switch (sheet.title) {
                case 'Members2016':
                    sheet2016 = sheet;
                    break;
                case 'Members2015':
                    sheet2015 = sheet;
                    break;
            }
        });

        if (!sheet2016 || !sheet2015) {
            console.log("can't find Members2015 or Members2015!");
            return next('missing sheets');
        }

        search(sheet2016, req.params.name, sheet2016.colCount, function (err, info) {
            if (err) {
                return next(err);
            }

            if (info) {
                info.last_paid_year = 2016;
                res.send(info);
                return next();
            }

            search(sheet2015, req.params.name, sheet2015.colCount, function (err, info) {
                if (err) {
                    return next(err);
                }

                if (info) {
                    info.last_paid_year = 2015;
                    res.send(info);
                    return next();
                }

                return next(new restify.NotFoundError('Не познавам '+req.params.name));
            });
        });
    });
});

server.listen(process.env.PORT || 8080, function () {
    console.log('%s %s listening at %s', server.name, pkg.version, server.url);
});
