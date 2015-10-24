var express = require('express');
var router = express.Router();
var q = require('q');

/**
 * @api {post} /consumption Create a consumption
 * @apiName CreateConsumption
 * @apiGroup Consumption
 *
 * @apiParam {Number} date  Unix timestamp of the date and time of the consumption
 * @apiParam {Number} count  numerical quantity as measured by the drug's unit
 * @apiParam {Number} experience_id  ID of the experience the consumption is part of
 * @apiParam {Number} drug_id  ID of the drug consumed
 * @apiParam {Number} method_id  ID of the method used to consume the drug
 *
 * @apiPermission ValidUserBasicAuthRequired
 *
 * @apiSuccess {Number} id  id of the created consumption
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 201 Created
 *     {
 *       "id": 3,
 *     }
 *
 * @apiError missingField date, count, experience_id, drug_id, and method_id required - one or more was not provided
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "consumption": "date, count, experience_id, drug_id, and method_id required"
 *     }
 *
 * @apiError timestampError timestamp must be positive unix time integer, down to seconds resolution
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "consumption": "timestamp must be positive unix time integer, down to seconds resolution"
 *     }
 *
 * @apiError invalidExperience the requested experience association doesn't exist or belong to this user
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "consumption": "the requested experience association doesn't exist or belong to this user"
 *     }
 *
 * @apiError invalidDrug the requested drug association doesn't exist or belong to this user
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "consumption": "the requested drug association doesn't exist or belong to this user"
 *     }
 *
 * @apiError invalidMethon the requested method association doesn't exist or belong to this user
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "consumption": "the requested method association doesn't exist or belong to this user"
 *     }
 */
router.post('/', function(req, res, next) {
  // not enough fields were provided
  if (req.body === undefined || !("date" in req.body) || !("count" in req.body) ||
    !("experience_id" in req.body) || !("drug_id" in req.body) || !("method_id" in req.body)) {
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      consumption: "date, count, experience_id, drug_id, and method_id required"
    }));
    return;
  }

  // check for bad timestamp
  if (req.body.date < 0 || isNaN(req.body.date)) {
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      consumption: "timestamp must be positive unix time integer, down to seconds resolution"
    }));
    return;
  }

  // check for bad experience
  db.all("SELECT * from experiences WHERE owner = $owner AND id = $id", {
    $owner: req.supID,
    $id: req.body.experience_id
  }, function(err, rows) {
    if (err) {
      res.setHeader('Content-Type', 'application/json');
      res.status(400).send(JSON.stringify({
        consumption: err
      }));
      return;
    }

    if (rows.length === 0) {
      res.setHeader('Content-Type', 'application/json');
      res.status(400).send(JSON.stringify({
        consumption: "the requested experience association doesn't exist or belong to this user"
      }));
      res.end();
      return;
    }

    // we have a good experience; check for bad drug
    db.all("SELECT * from drugs WHERE owner = $owner AND id = $id", {
      $owner: req.supID,
      $id: req.body.drug_id
    }, function(err, rows) {
      if (err) {
        res.setHeader('Content-Type', 'application/json');
        res.status(400).send(JSON.stringify({
          consumption: err
        }));
        return;
      }

      if (rows.length === 0) {
        res.setHeader('Content-Type', 'application/json');
        res.status(400).send(JSON.stringify({
          consumption: "the requested drug association doesn't exist or belong to this user"
        }));
        return;
      }

      // we have a good experience and drug; check for bad method
      db.all("SELECT * from methods WHERE owner = $owner AND id = $id", {
        $owner: req.supID,
        $id: req.body.method_id
      }, function(err, rows) {
        if (err) {
          res.setHeader('Content-Type', 'application/json');
          res.status(400).send(JSON.stringify({
            consumption: err
          }));
          return;
        }

        if (rows.length === 0) {
          res.setHeader('Content-Type', 'application/json');
          res.status(400).send(JSON.stringify({
            consumption: "the requested method association doesn't exist or belong to this user"
          }));
          return;
        }

        // phew. we made it. stick it in.
        db.run("INSERT INTO consumptions (date, experience_id, count, drug_id, method_id, owner)" +
          " VALUES ($date, $experience_id, $count, $drug_id, $method_id, $owner)", {
            $date: req.body.date,
            $experience_id: req.body.experience_id,
            $count: req.body.count,
            $drug_id: req.body.drug_id,
            $method_id: req.body.method_id,
            $owner: req.supID
          },
          function(err) {
            if (err) {
              res.setHeader('Content-Type', 'application/json');
              res.status(400).send(JSON.stringify({
                consumption: err
              }));
              return;
            }

            // you dun gud
            res.setHeader('Content-Type', 'application/json');
            res.status(201).send(JSON.stringify({
              id: this.lastID
            }));
          });
      });
    });
  });
});

/**
 * @api {get} /experience Get a JSON object of an experience
 * @apiName GetExperience
 * @apiGroup Experience
 *
 * @apiParam {Number} id  ID of the desired experience
 *
 * @apiPermission ValidUserBasicAuthRequired
 *
 * @apiSuccess {Number} id  id of the experience
 * @apiSuccess {Number} date  date of the experience
 * @apiSuccess {Number} ttime  id of the consumption for which T-0:00 time format is based off
 * @apiSuccess {String} title  title of the experience
 * @apiSuccess {String} location  location of the experience
 * @apiSuccess {String} notes  notes for the experience
 * @apiSuccess {String} panicmsg  user's panic message for the created experience
 * @apiSuccess {Number} rating_id  rating of general experience quality
 * @apiSuccess {Number} owner  id of the owner of the experience
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *        "date": 1445543583,
 *        "id": 1,
 *        "location": "My Location",
 *        "notes": "This is great.",
 *        "owner": 1,
 *        "panicmsg": "Oh snap help me!",
 *        "rating_id": 3,
 *        "title": "Great Time",
 *        "ttime": null
 *     }
 *
 * @apiError missingID id was not provided
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "experience": "id must be provided"
 *     }
 *
 * @apiError noRecords no results found for the given ID
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found
 */
router.get('/', function(req, res, next) {
  // not enough fields were provided
  if (req.body === undefined || !("id" in req.body) || isNaN(req.body.id)) {
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      experience: "id must be provided"
    }));
    return;
  }

  // get the entry
  db.get("SELECT * FROM experiences WHERE id = $id AND owner = $owner", {
    $id: req.body.id,
    $owner: req.supID
  }, function(err, row) {
    if (err) {
      res.setHeader('Content-Type', 'application/json');
      res.status(400).send(JSON.stringify({
        experience: err
      }));
      return;
    }

    // no rows returned; nothing for that ID
    if (row == []) {
      res.setHeader('Content-Type', 'application/json');
      res.status(404).send();
      return;
    }

    // return the experience
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(row));
  });
});

/**
 * @api {put} /experience Update an experience
 * @apiName UpdateExperience
 * @apiGroup Experience
 *
 * @apiParam {Number} id  id of the experience
 * @apiParam {Number} [date]  date of the experience
 * @apiParam {Number} [ttime]  id of the consumption for which T-0:00 time format is based off
 * @apiParam {String} [title]  title of the experience
 * @apiParam {String} [location]  location of the experience
 * @apiParam {String} [notes]  notes for the experience
 * @apiParam {String} [panicmsg]  user's panic message for the created experience
 * @apiParam {Number} [rating_id]  rating of general experience quality
 *
 * @apiPermission ValidUserBasicAuthRequired
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *
 * @apiError noFields no fields to set were provided
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "experience": "no fields provided"
 *     }
 *
 * @apiError illegalField a field to update was send that is not permitted (must be in above list)
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "experience": "custom field requested that is not permitted"
 *     }
 */
router.put('/', function(req, res, next) {
  var permittedFields = ['date', 'location', 'notes', 'panicmsg', 'rating_id', 'title', 'ttime', 'id'];

  //no fields were provided
  if (Object.keys(req.body).length === 0 || req.body === undefined) {
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      experience: "no fields provided"
    }));
    return;
  }

  if (Object.keys(req.body).every(function(field) {
      return permittedFields.indexOf(field) >= 0;
    })) {
    // all the keys of the request body (AKA all requested fields) are allowed; let them pass

    // assemble the query
    var columns = Object.keys(req.body).join(', ');
    var updateVals = [];
    var dataArray = {};

    // set the column1 = value1, etc. for the update
    Object.keys(req.body).forEach(function(columnName) {
      updateVals.push(columnName + ' = $' + columnName);
    });

    var query = 'UPDATE experiences SET ' + updateVals.join(', ') + ' WHERE id = $expid AND owner = $owner';
    dataArray.$owner = req.supID;

    // loop through each key and build the JSON object of bindings for sqlite
    Object.keys(req.body).forEach(function(columnName) {
      dataArray["$" + columnName] = req.body[columnName];
    });

    // add the experience ID
    dataArray.$expid = req.body.id;

    db.run(query, dataArray, function(err) {
      if (err) {
        res.status(500).send();
        return;
      }

      // all done. loaded and ready.
      res.setHeader('Content-Type', 'application/json');
      res.status(200).send();
    });
  } else {
    // they tried to send an unsupported key; kick 'em out
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      experience: "custom field requested that is not permitted"
    }));
  }
});

/**
 * @api {get} /experience/search Retrieve an array of experiences that match the provided criteria
 * @apiName SearchExperience
 * @apiGroup Experience
 *
 * @apiParam {Number} [startdate]  Unix timestamp of beginning of date range to select
 * @apiParam {Number} [enddate]  Unix timestamp of end of date range to select
 * @apiParam {String} [title]  experiences where this string is contained in the title will be retrieved
 * @apiParam {String} [location]  experiences where this string is contained in the location field will be retrieved
 * @apiParam {String} [notes]  experiences where this string is contained in the notes field will be retrieved
 * @apiParam {Number} [rating_id]  experiences with this rating will be retrieved
 * @apiParam {Number} [limit]  only return this number of rows
 * @apiParam {Number} [offset]  offset the returned number of rows by this amount (requires limit)
 *
 * @apiPermission ValidUserBasicAuthRequired
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *
 * @apiError noResults no experiences match the provided criteris
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found Bad Request
 *
 */
router.get('/search', function(req, res, next) {
  // get our limits and offset
  var limitOffset = "";

  // start assembling the query
  var queryData = {};

  // base and owner
  var query = "SELECT * FROM experiences WHERE owner = $owner";
  queryData.$owner = req.supID;

  if (req.body !== undefined) {
    if ("limit" in req.body) {
      if (parseInt(req.body.limit)) {
        // we have a parseable int
        limitOffset += " LIMIT " + parseInt(req.body.limit);
      }
    }

    if ("offset" in req.body) {
      if (parseInt(req.body.offset)) {
        // we have a parseable int
        limitOffset += "," + parseInt(req.body.offset);
      }
    }

    // get date range
    if ("startdate" in req.body && "enddate" in req.body) {
      // we have date parameters
      query += " AND date BETWEEN $startdate AND $enddate";
      queryData.$startdate = req.body.startdate;
      queryData.$enddate = req.body.enddate;
    }

    // get rating
    if ("rating_id" in req.body) {
      // we have date parameters
      query += " AND rating_id = $rating_id";
      queryData.$rating_id = req.body.rating_id;
    }

    // get location
    if ("location" in req.body) {
      // we have date parameters
      query += " AND location LIKE '%' || $location || '%'";
      queryData.$location = req.body.location;
    }

    // get notes
    if ("notes" in req.body) {
      // we have date parameters
      query += " AND notes LIKE '%' || $notes || '%'";
      queryData.$notes = req.body.notes;
    }

    // get title
    if ("title" in req.body) {
      // we have date parameters
      query += " AND title LIKE '%' || $title || '%'";
      queryData.$title = req.body.title;
    }

    // slap the limit and offset on the enddate
    query += limitOffset;
  }

  // get the entry
  db.all(query, queryData, function(err, rows) {
    if (err) {
      res.setHeader('Content-Type', 'application/json');
      res.status(400).send(JSON.stringify({
        experience: err
      }));
      return;
    }

    // no rows returned
    if (rows.length === 0) {
      res.setHeader('Content-Type', 'application/json');
      res.status(404).send();
      return;
    }

    // return the experience
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(rows));
  });
});

module.exports = router;
