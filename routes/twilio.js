/* globals db,startTime */
/*jshint -W083 */ // let us make loops for getting files
"use strict";

var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var config = require('../data/config');
var request = require('request');
var fs = require('fs');

// make a case insensitive startsWith
if (typeof String.prototype.startsWithCI !== 'function') {
  String.prototype.startsWithCI = function(str) {
    var lowerString = this.toLowerCase();
    return lowerString.slice(0, str.length) === str.toLowerCase();
  };
}

if (process.env.NODE_ENV === "test") {
  var uploadLocation = config.media.test_location;
} else {
  var uploadLocation = config.media.location;
}

router.get('/', function(req, res, next) {
  req.body = req.query;
  if (req.body === undefined || req.body.From === undefined) {
    res.status(400).send();
    return;
  }

  var userPhone = req.body.From;
  var twiml;
  db.all("SELECT * FROM users WHERE phone = $phone", {
    $phone: userPhone
  }, function(err, users) {
    if (err) {
      console.log(err);
      return;
    }

    if (users.length !== 1) {
      twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Ambiguous or no such user</Message></Response>';
      res.setHeader('Content-Type', 'text/xml');
      res.status(200).send(twiml);
      return;
    }

    if (req.body.NumMedia > 0) {
      // handle media
      db.all("SELECT * FROM experiences WHERE owner = $owner ORDER BY date DESC LIMIT 1", {
        $owner: users[0].id
      }, function(err, experiences) {
        if (experiences.length === 0) {
          twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No experiences to add to!</Message></Response>';
          res.setHeader('Content-Type', 'text/xml');
          res.status(200).send(twiml);
          return;
        } else {
          // array of filenames to use
          var loadedCount = 0;
          for (var mediaIndex = 0; mediaIndex < req.body.NumMedia; mediaIndex += 1) {
            var filename = crypto.randomBytes(16).toString('hex');
            request(req.body['MediaUrl' + mediaIndex]).pipe(fs.createWriteStream(uploadLocation + '/' + filename));

            db.run("INSERT INTO media (filename, title, date, association_type, association, explicit, favorite, owner)" +
              " VALUES ($filename, $title, $date, $association_type, $association, $explicit, $favorite, $owner)", {
                $filename: uploadLocation + filename,
                $title: "SMS Upload " + crypto.randomBytes(8).toString('hex'),
                $date: Math.floor(new Date().getTime() / 1000) - (new Date().getTimezoneOffset() * 60),
                $association_type: "experience",
                $association: experiences[0].id,
                $owner: users[0].id
              },
              function(err) {
                // BEWARE mediaIndex is one more than it should be... why? WHO KNOWS
                loadedCount += 1;
                if (loadedCount === parseInt(req.body.NumMedia)) {
                  var plural = '';
                  if (req.body.NumMedia > 1) {
                    plural = 's';
                  }

                  twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Processed ' + req.body.NumMedia + ' object' + plural + '.</Message></Response>';

                  res.setHeader('Content-Type', 'text/xml');
                  res.status(200).send(twiml);
                  return;
                }
              });
          }
        }
      });
    } else {
      if (req.body.Body.startsWithCI("commands")) {
        twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>[quicknote], [image file], listcon, setcount [id] [count], dupcon [id], jumpcon [id], namemedia [name]</Message></Response>';
        res.setHeader('Content-Type', 'text/xml');
        res.status(200).send(twiml);
        return;
      } else if (req.body.Body.startsWithCI("setcount")) {
        db.all("SELECT * FROM experiences WHERE owner = $owner ORDER BY date DESC LIMIT 1", {
          $owner: users[0].id
        }, function(err, experiences) {
          if (experiences.length === 0) {
            twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No experiences!</Message></Response>';
            res.setHeader('Content-Type', 'text/xml');
            res.status(200).send(twiml);
            return;
          } else {
            db.all("SELECT * from consumptions WHERE owner = $owner AND id = $consumption_id ORDER BY date DESC LIMIT 1", {
              $owner: users[0].id,
              $consumption_id: req.body.Body.split(' ')[1],
            }, function(err, consumptions) {
              if (consumptions.length === 0) {
                twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No consumptions!</Message></Response>';
                res.setHeader('Content-Type', 'text/xml');
                res.status(200).send(twiml);
                return;
              }

              db.run('UPDATE consumptions SET count = $count WHERE id = $id', {
                $count: req.body.Body.split(' ')[2],
                $id: req.body.Body.split(' ')[1]
              }, function(err) {
                twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Updated from ' + consumptions[0].count + ' to ' + req.body.Body.split(' ')[2] + ' </Message></Response>';
                res.setHeader('Content-Type', 'text/xml');
                res.status(200).send(twiml);
                return;
              });
            });
          }
        });
      } else if (req.body.Body.startsWithCI("listcon")) {
        db.all("SELECT * FROM experiences WHERE owner = $owner ORDER BY date DESC LIMIT 1", {
          $owner: users[0].id
        }, function(err, experiences) {
          if (experiences.length === 0) {
            twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No experiences to add to!</Message></Response>';
            res.setHeader('Content-Type', 'text/xml');
            res.status(200).send(twiml);
            return;
          } else {
            db.all("SELECT *, C.id as cid FROM consumptions C LEFT JOIN drugs D ON C.drug_id = D.id WHERE C.owner = $owner AND C.experience_id = $experience_id ORDER BY date DESC", {
              $owner: users[0].id,
              $experience_id: experiences[0].id,
            }, function(err, consumptions) {
              if (consumptions.length === 0) {
                twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No consumptions!</Message></Response>';
                res.setHeader('Content-Type', 'text/xml');
                res.status(200).send(twiml);
                return;
              }

              var allConsumptions = [];
              allConsumptions = consumptions.map(function(consumption) {
                return consumption.cid + ': ' + consumption.count + ' ' + consumption.unit + ' ' + consumption.name;
              });

              twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>' + allConsumptions.join(", ") + '</Message></Response>';
              res.setHeader('Content-Type', 'text/xml');
              res.status(200).send(twiml);
              return;
            });
          }
        });
      } else if (req.body.Body.startsWithCI("dupcon")) {
        db.all("SELECT * FROM experiences WHERE owner = $owner ORDER BY date DESC LIMIT 1", {
          $owner: users[0].id
        }, function(err, experiences) {
          if (experiences.length === 0) {
            twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No experiences!</Message></Response>';
            res.setHeader('Content-Type', 'text/xml');
            res.status(200).send(twiml);
            return;
          } else {
            db.all("SELECT * from consumptions WHERE owner = $owner AND id = $consumption_id ORDER BY date DESC LIMIT 1", {
              $owner: users[0].id,
              $consumption_id: req.body.Body.split(' ')[1],
            }, function(err, consumptions) {
              if (consumptions.length === 0) {
                twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No consumptions!</Message></Response>';
                res.setHeader('Content-Type', 'text/xml');
                res.status(200).send(twiml);
                return;
              }

              db.run("INSERT INTO consumptions (date, experience_id, count, drug_id, method_id, location, owner)" +
                " VALUES ($date, $experience_id, $count, $drug_id, $method_id, $location, $owner)", {
                  $date: Math.floor((new Date().getTime() - (new Date().getTimezoneOffset()) * 60000) / 1000),
                  $experience_id: consumptions[0].experience_id,
                  $count: consumptions[0].count,
                  $drug_id: consumptions[0].drug_id,
                  $method_id: consumptions[0].method_id,
                  $location: consumptions[0].location,
                  $owner: consumptions[0].owner
                },
                function(err) {
                  twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Duplicated consumption.</Message></Response>';
                  res.setHeader('Content-Type', 'text/xml');
                  res.status(200).send(twiml);
                  return;
                });
            });
          }
        });
      } else if (req.body.Body.startsWithCI("jumpcon")) {
        db.all("SELECT * FROM experiences WHERE owner = $owner ORDER BY date DESC LIMIT 1", {
          $owner: users[0].id
        }, function(err, experiences) {
          if (experiences.length === 0) {
            twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No experiences!</Message></Response>';
            res.setHeader('Content-Type', 'text/xml');
            res.status(200).send(twiml);
            return;
          } else {
            db.all("SELECT * from consumptions WHERE owner = $owner AND id = $consumption_id ORDER BY date DESC LIMIT 1", {
              $owner: users[0].id,
              $consumption_id: req.body.Body.split(' ')[1],
            }, function(err, consumptions) {
              if (consumptions.length === 0) {
                twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No consumptions!</Message></Response>';
                res.setHeader('Content-Type', 'text/xml');
                res.status(200).send(twiml);
                return;
              }

              db.run("UPDATE consumptions SET date = $date WHERE id = $id", {
                  $date: Math.floor((new Date().getTime() - (new Date().getTimezoneOffset()) * 60000) / 1000),
                  $id: consumptions[0].id
                },
                function(err) {
                  twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Date jumped.</Message></Response>';
                  res.setHeader('Content-Type', 'text/xml');
                  res.status(200).send(twiml);
                  return;
                });
            });
          }
        });
      } else if (req.body.Body.startsWithCI("namemedia")) {
        db.all("SELECT * FROM media WHERE owner = $owner ORDER BY date DESC LIMIT 1", {
          $owner: users[0].id
        }, function(err, media) {
          if (media.length === 0) {
            twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No media!</Message></Response>';
            res.setHeader('Content-Type', 'text/xml');
            res.status(200).send(twiml);
            return;
          } else {
            db.run("UPDATE media SET title = $title WHERE id = $id", {
                $title: req.body.Body.split(' ')[1],
                $id: media[0].id
              },
              function(err) {
                var fullName = [];
                fullName = req.body.Body.split(' ').map(function(word, index) {
                  if (index > 0) {
                    return word;
                  }
                });

                twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Media renamed from ' + media[0].title + ' to' + fullName.join(" ") + '.</Message></Response>';
                res.setHeader('Content-Type', 'text/xml');
                res.status(200).send(twiml);
                return;
              });
          }
        });

      } else {
        db.all("SELECT * FROM experiences WHERE owner = $owner ORDER BY date DESC LIMIT 1", {
          $owner: users[0].id
        }, function(err, experiences) {
          if (experiences.length === 0) {
            twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>No experiences!</Message></Response>';
            res.setHeader('Content-Type', 'text/xml');
            res.status(200).send(twiml);
            return;
          } else {
            if (experiences[0].notes === null) {
              // set as empty so it doesn't go in as null
              experiences[0].notes = "";
            }

            var newNotes;
            if (experiences[0].ttime) {
              db.all("SELECT * from consumptions WHERE owner = $owner AND id = $consumption_id ORDER BY date DESC LIMIT 1", {
                $owner: users[0].id,
                $consumption_id: experiences[0].ttime,
              }, function(err, consumptions) {
                var conDate = Math.floor(new Date(consumptions[0].date * 1000).getTime() / 1000);
                var now = Math.floor(new Date().getTime() / 1000) - (new Date().getTimezoneOffset() * 60);

                var sign = '+';
                if (conDate > now) {
                  sign = '-';
                }

                var diff = Math.abs(now - conDate);
                var hours = Math.floor(diff / 60 / 60);
                diff -= hours * 60 * 60;
                var minutes = Math.floor(diff / 60);

                newNotes = experiences[0].notes + '\nT' + sign + ('0' + hours).slice(-2) + ':' + ('0' + minutes).slice(-2) + ' -- ' + req.body.Body;

                db.run("UPDATE experiences SET notes = $notes WHERE id = $id", {
                    $notes: newNotes,
                    $id: experiences[0].id
                  },
                  function(err) {
                    twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Note added.</Message></Response>';
                    res.setHeader('Content-Type', 'text/xml');
                    res.status(200).send(twiml);
                    return;
                  });
              });
            } else {
              var monthNames = [
                "January", "February", "March",
                "April", "May", "June", "July",
                "August", "September", "October",
                "November", "December"
              ];

              var date = new Date();
              var day = date.getDate();
              var monthIndex = date.getMonth();
              var year = date.getFullYear();

              var currentDateEpoch = Math.floor(Date.parse(day + ' ' + monthNames[monthIndex] + ', ' + year + ' 00:00:00 GMT') / 1000);

              var dateBlock;
              if (experiences[0].date === currentDateEpoch) {
                // we're on the same day; procees as planned
                dateBlock = ('0' + new Date().getHours()).slice(-2) + ('0' + new Date().getMinutes()).slice(-2);
              } else {
                dateBlock = new Date().getMonth() + '-' + new Date().getDate() + ' ' + ('0' + new Date().getHours()).slice(-2) + ('0' + new Date().getMinutes()).slice(-2);
              }
              
              newNotes = experiences[0].notes + '\n' + dateBlock + ' -- ' + req.body.Body;
              db.run("UPDATE experiences SET notes = $notes WHERE id = $id", {
                  $notes: newNotes,
                  $id: experiences[0].id
                },
                function(err) {
                  twiml = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Note added.</Message></Response>';
                  res.setHeader('Content-Type', 'text/xml');
                  res.status(200).send(twiml);
                  return;
                });
            }
          }
        });
      }
    }
  });
});

module.exports = router;
