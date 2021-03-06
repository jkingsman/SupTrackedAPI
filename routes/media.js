/* globals db */
"use strict";
var config = require('../data/config');
var multer = require('multer');
var rimraf = require('rimraf');
var fs = require('fs');
var path = require('path');

if (process.env.NODE_ENV === "test") {
  var uploadLocation = config.media.test_location;
} else {
  var uploadLocation = config.media.location;
}


var upload = multer({
  dest: uploadLocation
});

var express = require('express');
var router = express.Router();

/**
 * @api {post} /media Create a media entry (must use multipart form)
 * @apiName CreateMedia
 * @apiGroup Media
 *
 * @apiParam {File} image  the desired image
 * @apiParam {String} title  title of the image
 * @apiParam {String} [tags]  tags for the image
 * @apiParam {String} [date]  date the image was taken (leave blank for current date and time)
 * @apiParam {String} association_type  what type of object the media should be associated with; "drug" or "experience"
 * @apiParam {Number} association  id of the associated drug or experience
 * @apiParam {Number} [explicit]  1 indicates that the content is explicit (defaults to 0)
 * @apiParam {Number} [favorite]  1 indicates that the content is a favorite piece of content (defaults to 0)
 *
 * @apiPermission ValidUserBasicAuthRequired
 *
 * @apiSuccess {Number} id  id of the created media
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 201 Created
 *     {
 *       "id": 3,
 *     }
 *
 * @apiError missingField a required field was missing
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "media": "file, title, association_type, and association required"
 *     }
 *
 * @apiError badAssociationType associationType was not "drug" or "experience"
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "media": "associationType was not 'drug' or 'experience'"
 *     }
 *
 * @apiError badAssociation association was not found with the given ID
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "media": "association not found"
 *     }
 */

router.post('/', upload.single('image'), function(req, res, next) {
  // not enough fields were provided
  if (req.body === undefined || req.file === undefined ||
    !("title" in req.body) || !("association_type" in req.body) ||
    !("association" in req.body)) {
    // kill the uploaded file if it exists
    if (req.file !== undefined && fs.existsSync(req.file.destination + req.file.filename)) {
      rimraf(req.file.destination + req.file.filename);
    }

    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      media: "file, title, notes, association_type, and association required"
    }));
    return;
  }

  // make sure the association_type is valid
  if (req.body.association_type !== 'drug' && req.body.association_type !== 'experience') {
    // kill the uploaded file (it exists because we got this far)
    rimraf(req.file.destination + req.file.filename, function() {
      // file is deleted; tell about the problem
      res.setHeader('Content-Type', 'application/json');
      res.status(400).send(JSON.stringify({
        media: "association_type was not 'drug' or 'experience'"
      }));
      return;
    });
    return;
  }

  // make sure the association actually exists
  // (low risk of injection because we were explicit in checking above)
  db.all("SELECT * FROM " + req.body.association_type + "s WHERE id = $id AND owner = $owner", {
    $id: req.body.association,
    $owner: req.supID
  }, function(err, association) {
    if (err) {
      res.setHeader('Content-Type', 'application/json');
      res.status(400).send(JSON.stringify({
        media: err
      }));
      return;
    }

    if (association.length > 0) {
      // compile out optional parameters
      if (req.body.tags === undefined) {
        req.body.tags = '';
      }

      if (req.body.explicit === undefined) {
        req.body.explicit = 0;
      }

      if (req.body.favorite === undefined) {
        req.body.favorite = 0;
      }

      if (req.body.date === undefined) {
        req.body.date = Math.floor(Date.now() / 1000);
      }


      // insert it
      db.run("INSERT INTO media (filename, title, tags, date, association_type, association, explicit, favorite, owner)" +
        " VALUES ($filename, $title, $tags, $date, $association_type, $association, $explicit, $favorite, $owner)", {
          $filename: req.file.destination + req.file.filename,
          $title: req.body.title,
          $tags: req.body.tags,
          $date: req.body.date,
          $association_type: req.body.association_type,
          $association: req.body.association,
          $explicit: req.body.explicit,
          $favorite: req.body.favorite,
          $owner: req.supID
        },
        function(err) {
          if (err) {
            res.setHeader('Content-Type', 'application/json');
            res.status(400).send(JSON.stringify({
              media: err
            }));
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.status(201).send(JSON.stringify({
            id: this.lastID
          }));
        });
    } else {
      // no association found
      rimraf(req.file.destination + req.file.filename, function() {
        // file is deleted; tell about the problem
        res.setHeader('Content-Type', 'application/json');
        res.status(400).send(JSON.stringify({
          media: "association not found"
        }));
        return;
      });
    }
  });
});

/**
 * @api {get} /media/file/:id Get an image file
 * @apiName GetMediaFile
 * @apiGroup Media
 *
 * @apiParam {Number} id  ID of the desired media
 *
 * @apiPermission ValidUserBasicAuthRequired
 *
 * @apiSuccess {Number} id  id of the media
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *     [image file]
 *
 * @apiError missingID id was not provided
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "media": "id must be provided"
 *     }
 *
 * @apiError noRecords no results found for the given ID
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found
 */
router.get('/file/:id', function(req, res, next) {
  // not enough fields were provided
  if (req.params === {} || isNaN(req.params.id)) {
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      media: "id must be provided"
    }));
    return;
  }

  // get the entry
  db.all("SELECT * FROM media WHERE id = $id AND owner = $owner", {
    $id: req.params.id,
    $owner: req.supID
  }, function(err, media) {
    if (err) {
      res.setHeader('Content-Type', 'application/json');
      res.status(400).send(JSON.stringify({
        media: err
      }));
      return;
    }

    // nothing for that ID
    if (media.length === 0) {
      res.setHeader('Content-Type', 'application/json');
      res.status(404).send();
      return;
    }

    // return the media
    res.sendFile(path.resolve(media[0].filename));
    return;
  });
});

/**
 * @api {delete} /media Delete a media object
 * @apiName DeleteMedia
 * @apiGroup Media
 *
 * @apiParam {Number} id  ID of the media
 *
 * @apiPermission ValidUserBasicAuthRequired
 *
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *
 * @apiError missingID id was not provided
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "media": "id must be provided"
 *     }
 *
 * @apiError noRecords no media exists for the given ID
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found
 */
router.delete('/', function(req, res, next) {
  // not enough fields were provided
  if (req.body === undefined || !("id" in req.body) || isNaN(req.body.id)) {
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      media: "id must be provided"
    }));
    return;
  }

  // get the entry
  db.all("SELECT * FROM media WHERE id = $id AND owner = $owner", {
    $id: req.body.id,
    $owner: req.supID
  }, function(err, media) {
    if (err) {
      res.setHeader('Content-Type', 'application/json');
      res.status(400).send(JSON.stringify({
        media: err
      }));
      return;
    }

    // no drugs returned; nothing for that ID
    if (media.length === 0) {
      res.setHeader('Content-Type', 'application/json');
      res.status(404).send();
      return;
    }

    db.run("DELETE FROM media WHERE id = $id AND owner = $owner", {
      $id: req.body.id,
      $owner: req.supID
    }, function(err) {
      if (err) {
        res.setHeader('Content-Type', 'application/json');
        res.status(400).send(JSON.stringify({
          media: err
        }));
        return;
      }

      // deleted the media; now kill the file
      rimraf(media[0].filename, function() {
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send();
        return;
      });
    });
  });
});

/**
 * @api {put} /media Update a media object
 * @apiName UpdateMedia
 * @apiGroup Media
 *
 * @apiParam {Number} id  id of the media
 * @apiParam {String} [title]  title of the image
 * @apiParam {String} [tags]  tags for the image
 * @apiParam {String} [date]  date the image was taken
 * @apiParam {String} [association_type]  what type of object the media should be associated with; "drug" or "experience"
 * @apiParam {Number} [association]  id of the associated drug or experience
 * @apiParam {Number} [explicit]  1 indicates that the content is explicit
 * @apiParam {Number} [favorite]  1 indicates that the content is a favorite piece of content
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
 *       "media": "no fields provided"
 *     }
 *
 * @apiError illegalField a field to update was send that is not permitted (must be in above list)
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "media": "custom field requested that is not permitted"
 *     }
 */
router.put('/', function(req, res, next) {
  var permittedFields = ['title', 'tags', 'date', 'association_type', 'association', 'explicit', 'favorite', 'id'];

  //no fields were provided
  if (Object.keys(req.body).length === 0 || req.body === undefined) {
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      media: "no fields provided"
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

    db.all("SELECT * FROM media WHERE id = $id AND owner = $owner", {
      $id: req.body.id,
      $owner: req.supID
    }, function(err, media) {
      if (err) {
        res.setHeader('Content-Type', 'application/json');
        res.status(400).send(JSON.stringify({
          media: err
        }));
        return;
      }

      // no media returned; nothing for that ID
      if (media.length === 0) {
        res.setHeader('Content-Type', 'application/json');
        res.status(404).send();
        return;
      }

      var query = 'UPDATE media SET ' + updateVals.join(', ') + ' WHERE id = $id AND owner = $owner';
      dataArray.$owner = req.supID;

      // loop through each key and build the JSON object of bindings for sqlite
      Object.keys(req.body).forEach(function(columnName) {
        dataArray["$" + columnName] = req.body[columnName];
      });

      db.run(query, dataArray, function(err) {
        if (err) {
          res.status(500).send();
          return;
        }

        // all done. loaded and ready.
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send();
      });
    });
  } else {
    // they tried to send an unsupported key; kick 'em out
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      media: "custom field requested that is not permitted"
    }));
  }
});

/**
 * @api {post} /media/search Retrieve an array of media that match the provided criteria
 * @apiName SearchMedia
 * @apiGroup Media
 *
 * @apiSuccess {Object[]} media  JSON array of media
 * @apiSuccess {Number} media.id  id of the media
 * @apiSuccess {String} media.title  title of the image
 * @apiSuccess {String} media.tags  tags for the image
 * @apiSuccess {String} media.date  date the image was taken
 * @apiSuccess {String} media.association_type  what type of object the media should be associated with; "drug" or "experience"
 * @apiSuccess {Number} media.association  id of the associated drug or experience (requires association type)
 * @apiSuccess {String} media.exp_title  title of associated experience (empty if associated with a drug)
 * @apiSuccess {Number} media.explicit  1 indicates that the content is explicit
 * @apiSuccess {Number} media.favorite  1 indicates that the content is a favorite piece of content
 * @apiSuccess {Number} media.owner   id of the owner
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *        "id": 1,
 *        "title": "Me",
 *        "tags": "selfie me",
 *        "date": 1445995224,
 *        "association_type": "experience",
 *        "association": "1",
 *        "exp_title": "My Cool Experience",
 *        "explicit": 0,
 *        "favorite": 1,
 *        "owner": 1
 *     }
 *
 * @apiParam {Number} [startdate]  Unix timestamp of beginning of date range to select
 * @apiParam {Number} [enddate]  Unix timestamp of end of date range to select
 * @apiParam {String} [title]  title of the image
 * @apiParam {String} [tags]  tags for the image
 * @apiParam {String} [association_type]  what type of object the media should be associated with; "drug" or "experience"
 * @apiParam {Number} [association]  id of the associated drug or experience
 * @apiParam {Number} [explicit]  1 indicates that the content is explicit
 * @apiParam {Number} [favorite]  1 indicates that the content is a favorite piece of content
 * @apiParam {Number} [limit]  only return this number of rows
 * @apiParam {Number} [offset]  offset the returned number of rows by this amount (requires limit)
 *
 * @apiPermission ValidUserBasicAuthRequired
 *
 * @apiError noResults no experiences or consumptions match the provided criteria
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found Bad Request
 *
 */
router.post('/search', function(req, res, next) {
  // start assembling the query
  var queryData = {};
  var query = "";
  var searchCriteria = [];
  var limitCriteria = "";
  var limitOffset = "";

  if (req.body !== undefined && Object.keys(req.body).length > 0) {
    if ("limit" in req.body) {
      if (parseInt(req.body.limit)) {
        // we have a parseable int
        limitOffset += " LIMIT " + parseInt(req.body.limit);
      }
    }

    if ("offset" in req.body) {
      if (parseInt(req.body.offset)) {
        // we have a parseable int
        limitOffset += " OFFSET " + parseInt(req.body.offset);
      }
    }

    // get date range
    if ("startdate" in req.body && "enddate" in req.body) {
      searchCriteria.push("m.date BETWEEN $startdate AND $enddate");
      queryData.$startdate = req.body.startdate;
      queryData.$enddate = req.body.enddate;
    }

    // get title
    if ("title" in req.body) {
      searchCriteria.push("m.title LIKE '%' || $title || '%'");
      queryData.$title = req.body.title;
    }

    // get tags
    if ("tags" in req.body) {
      searchCriteria.push("m.tags LIKE '%' || $tags || '%'");
      queryData.$tags = req.body.tags;
    }

    // get association_type
    if ("association_type" in req.body) {
      searchCriteria.push("m.association_type = $association_type");
      queryData.$association_type = req.body.association_type;
    }

    // get association
    if ("association" in req.body) {
      searchCriteria.push("m.association = $association");
      queryData.$association = req.body.association;
    }

    // get explicit
    if ("explicit" in req.body) {
      searchCriteria.push("m.explicit = $explicit");
      queryData.$explicit = req.body.explicit;
    }

    // get favorite
    if ("favorite" in req.body) {
      searchCriteria.push("m.favorite = $favorite");
      queryData.$favorite = req.body.favorite;
    }
  }

  // slap the limit and offset
  query = "SELECT m.*, CASE WHEN m.association_type = 'experience' then e.title else '' end as exp_title FROM media m LEFT JOIN experiences e ON m.association = e.id ";

  query += " WHERE";

  if (searchCriteria.length > 0) {
    // we know we have search criteria; add it
    query += " " + searchCriteria.join(" AND ");
    query += " AND m.owner = $owner";
    queryData.$owner = req.supID;
  } else {
    query += " m.owner = $owner";
    queryData.$owner = req.supID;
  }

  query += " ORDER BY m.date desc";
  query += limitOffset;

  // get the media
  db.all(query, queryData, function(err, media) {
    if (err) {
      res.setHeader('Content-Type', 'application/json');
      res.status(400).send(JSON.stringify({
        media: err
      }));
      return;
    }

    // clean out the filename
    media.forEach(function(entry, index, originalArray) {
      originalArray[index].filename = undefined;
    });

    // fix numerical listings since date comes out funny -- KLUDGE ALERT
    // media.forEach(function(entry, index, originalArray) {
    //   originalArray[index].date = originalArray[index].date.toString();
    // });

    // no media returned
    if (media.length === 0) {
      res.setHeader('Content-Type', 'application/json');
      res.status(404).send();
      return;
    }

    // fire them off
    res.status(200).send(media);
  });
});

/**
 * @api {get} /media/:id Get a JSON object of a media object
 * @apiName GetMedia
 * @apiGroup Media
 *
 * @apiParam {Number} id  ID of the desired media
 *
 * @apiPermission ValidUserBasicAuthRequired
 *
 * @apiSuccess {Number} id  id of the media
 * @apiSuccess {String} title  title of the image
 * @apiSuccess {String} tags  tags for the image
 * @apiSuccess {String} date  date the image was taken
 * @apiSuccess {String} association_type  what type of object the media should be associated with; "drug" or "experience"
 * @apiSuccess {Number} association  id of the associated drug or experience
 * @apiSuccess {String} exp_title  title of associated experience (empty if associated with a drug)
 * @apiSuccess {Number} explicit  1 indicates that the content is explicit
 * @apiSuccess {Number} favorite  1 indicates that the content is a favorite piece of content
 * @apiSuccess {Number} owner   id of the owner
 *
 * @apiSuccessExample Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *        "id": 1,
 *        "title": "Me",
 *        "tags": "selfie me",
 *        "date": 1445995224,
 *        "association_type": "experience",
 *        "association": "1",
 *        "explicit": 0,
 *        "favorite": 1,
 *        "owner": 1
 *     }
 *
 * @apiError missingID id was not provided
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 400 Bad Request
 *     {
 *       "media": "id must be provided"
 *     }
 *
 * @apiError noRecords no results found for the given ID
 *
 * @apiErrorExample Error-Response:
 *     HTTP/1.1 404 Not Found
 */
router.get('/:id', function(req, res, next) {
  // not enough fields were provided
  if (req.params === {} || isNaN(req.params.id)) {
    res.setHeader('Content-Type', 'application/json');
    res.status(400).send(JSON.stringify({
      media: "id must be provided"
    }));
    return;
  }

  // get the entry
  db.all("SELECT m.*, CASE WHEN m.association_type = 'experience' then e.title else '' end as exp_title FROM media m LEFT JOIN experiences e ON m.association = e.id WHERE m.id = $id AND m.owner = $owner", {
    $id: req.params.id,
    $owner: req.supID
  }, function(err, media) {
    if (err) {
      res.setHeader('Content-Type', 'application/json');
      res.status(400).send(JSON.stringify({
        media: err
      }));
      return;
    }

    // no drugs returned; nothing for that ID
    if (media.length === 0) {
      res.setHeader('Content-Type', 'application/json');
      res.status(404).send();
      return;
    }

    // pop out the filename
    media[0].filename = undefined;

    // return the media
    res.setHeader('Content-Type', 'application/json');
    res.status(200).send(JSON.stringify(media[0]));
  });
});

module.exports = router;
