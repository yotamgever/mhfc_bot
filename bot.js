const request = require('request');
const TelegramBot = require('node-telegram-bot-api');
const config = require('config');

const token = config.get('bot.token');

const bot = new TelegramBot(token, {polling: true});

const language = require('./transltaions/english');

const defaultOptions = {
    reply_markup: {
        keyboard: [
            [{
                text: '/team',
                callback_data: '/team',
            },
            {
                text: '/team_ext',
                callback_data: '/team_ext',
            }]
        ],
        resize_keyboard: true,
        one_time_keyboard: true
    },
    parse_mode: 'Markdown'
};

bot.onText(/^\/team$/, function (msg) {
    const fromId = msg.from.id;

    getTeamStats().then((stats) => {
        const caption = 'TeamStats';
        const formattedStats = prettifyStats(stats, caption);

        bot.sendMessage(fromId, formattedStats, defaultOptions);        
    }).catch((error) => {
        bot.sendMessage(fromId, `Error: ${error}`, defaultOptions);        
    });
});

bot.onText(/\/team_ext/, function (msg) {
    const fromId = msg.from.id;

    const options = {
        extended: true,
    }

    getTeamStats(options).then((stats) => {
        const caption = 'TeamExtStats';
        const formattedStats = prettifyStats(stats, caption);

        bot.sendMessage(fromId, formattedStats, defaultOptions);        
    }).catch((error) => {
        bot.sendMessage(fromId, `Error: ${error}`, defaultOptions);        
    });
});

bot.onText(/\/player/, function (msg) {
    const fromId = msg.from.id;

    getAvailablePlayers().then((players) => {
        const keyboard = players.reduce((result, currentPlayer, index) => {
            if (index % 4 === 0) {
                result.push([]);
            }

            result[result.length - 1].push({
                text: `${currentPlayer.name}`,
                callback_data: `/${currentPlayer.id}`,
            });

            return result;
        },[]);

        const playersOptions = {
            reply_markup: {
                keyboard,
                resize_keyboard: true,
                one_time_keyboard: true
            },
            parse_mode: 'Markdown'
        };

        bot.sendMessage(fromId, 'Choose a player:', playersOptions).then(() => {
            bot.once("message", answer => {
                const player = players.find((currPlayer) => {
                    return answer.text === currPlayer.name;
                });

                if (!player) {
                    bot.sendMessage(fromId, 'Player not found!', defaultOptions);
                    return;
                }

                const playerId = player.id;
                const playerName = player.name;
                
                getSpecificPlayerStats(playerId).then((stats) => {
                    const caption = 'PlayerStats';
                    const formattedStats = prettifyStats(stats, caption);
            
                    bot.sendMessage(fromId, formattedStats, defaultOptions);   
                }).catch((error) => {
                    bot.sendMessage(fromId, `Error: ${error}`, defaultOptions);        
                });
            });
        });;        
    }).catch((error) => {
        bot.sendMessage(fromId, `Error: ${error}`, defaultOptions);        
    });
});

// const teamUrl = 'http://football.bamboo-video.com/api/football/team?format=json&filter={%22leagues.17/18%22:902}&returnZeros=false&expand=[%22stats%22]';
const teamUrl = 'http://football.bamboo-video.com/api/football/team?format=json&filter={%22leagues.17/18%22:902}&returnZeros=true&expand=[%22stats%22]';
const playersUrl = 'http://football.bamboo-video.com/api/football/player?format=json&returnZeros=false&expand=[%22stats%22]';
const availablePlayersUrl = 'http://football.bamboo-video.com/api/football/player?format=json&returnZeros=false&expand=[%22stats%22]&filter={%22teamId%22:4539}';
const specificPlayerUrl = 'http://football.bamboo-video.com/api/football/player?format=json&returnZeros=false&expand=[%22stats%22]';

function getAvailablePlayers() {
    return new Promise((resolve,reject)=>{
        request(availablePlayersUrl, function (error, response, body) {
          if (error || response.statusCode !== 200) {
            return reject(error||'Error getting data');
          }else{
            const availablePlayers = JSON.parse(body).data;

            const availablePlayersNames = Object.keys(availablePlayers).filter((currPlayer) => {
                return availablePlayers[currPlayer].position;
            }).sort((playerAId, playerBId) => {
                const playerA = availablePlayers[playerAId];
                const playerB = availablePlayers[playerBId];

                if (playerA.position === 'goalie') {
                    return -1;
                } else if (playerA.position === 'defenseman') {
                    if (playerB.position === 'goalie') {
                        return 1;
                    } else if (playerB.position === 'defenseman') {
                        return 0;
                    } else if ((playerB.position === 'mid-fielder') || (playerB.position === 'forward')) {
                        return -1;
                    }
                } else if (playerA.position === 'mid-fielder') {
                    if ((playerB.position === 'goalie') || (playerB.position === 'defenseman')) {
                        return 1;
                    } else if (playerB.position === 'mid-fielder') {
                        return 0;
                    } else if (playerB.position === 'forward') {
                        return -1;
                    }
                } else if (playerA.position === 'forward') {
                    return 1;
                }

                return 0;
            }).map((currPlayerId) => {
                return { 
                    id: availablePlayers[currPlayerId].id,
                    name: availablePlayers[currPlayerId].name,
                };
            });

            resolve(availablePlayersNames);
        }
      });
  });
}

function getTeamStats(options = {}) {
    const { extended } = options;

    return new Promise((resolve,reject)=>{
        request(teamUrl, function (error, response, body) {
          if (error || response.statusCode !== 200) {
            return reject(error||'Error getting data');
          }else{
            const allTeamsStats = JSON.parse(body);

            let totalStats = allTeamsStats.data["4539"].stats["17/18"][0];

            const statsToFilter = extended ? extendedTeamStats : summaryTeamStats

            const numberOfTeams = Object.keys(allTeamsStats.data).length;

            const wantedStatsWithAverage = {};
            
            Object.keys(allTeamsStats.data).forEach((currTeamId) => {
                Object.keys(statsToFilter).forEach((currWantedStat) => {
                    if (wantedStatsWithAverage[currWantedStat] === undefined) {
                        wantedStatsWithAverage[currWantedStat] = {
                            mhfcValue: 0,
                            avgValue: 0,
                        }
                    }

                    const teamAllStats = allTeamsStats.data[currTeamId].stats["17/18"][0];

                    if (currTeamId === '4539') {
                        wantedStatsWithAverage[currWantedStat].mhfcValue = teamAllStats[currWantedStat].toFixed(1);
                    }

                    wantedStatsWithAverage[currWantedStat].avgValue += teamAllStats[currWantedStat] || 0;
                });
            });

            Object.keys(wantedStatsWithAverage).forEach((currStatKey) => {
                const avgValue = wantedStatsWithAverage[currStatKey].avgValue / numberOfTeams;

                wantedStatsWithAverage[currStatKey].avgValue = avgValue.toFixed(1);
            });

            resolve(wantedStatsWithAverage);
          }
        });
    });
}

function getSpecificPlayerStats(playerId) {
    return new Promise((resolve,reject)=>{
        const playerStatsUrl = `${specificPlayerUrl}&filter={%22id%22:${playerId}}`;
        
        request(playerStatsUrl, function (error, response, body) {
          if (error || response.statusCode !== 200) {
            return reject(error||'Error getting data');
          }else{
            const playerData = JSON.parse(body).data[playerId];

            let playerStats = {
                position: playerData.position,
                shirtNumber: playerData.shirtNumber,
            };

            const playerSeasonStats = playerData.stats["17/18"][0];

            Object.keys(summaryPlayerStats).forEach((currWantedStat) => {
                playerStats[currWantedStat] = playerSeasonStats[currWantedStat] || 0;
            });

            resolve(playerStats);
        }
      });
  });
}

const summaryTeamStats = {
    opponentGoal: true,
    Goal: true,
    totalDistance: true,
    ballPossession: true,
}

const extendedTeamStats = Object.assign({}, summaryTeamStats, {
    OnTarget: true,
    ShotInsidetheArea: true,
    ShotOutsidetheArea: true,
    Header: true,
    passes: true,
    accuratePasses: true,
    keyPasses: true,
    tackles: true,
    tacklesSuccess: true,
});

const summaryPlayerStats = {
    GoalRegular: true,
    Assist: true,
    totalMinutesPlayed: true,
    tackles: true,
    AttemptonGoal: true,
    OnTarget: true,
    keyPasses: true,
    totalDistance: true,
    topSpeed: true,
    sprints: true,
    passes: true,
    accuratePasses: true,
    steals: true,
    lostBall: true,
    foul: true,
}

function getWantedStats(totalStats, statsToFilter) {
    let wantedStats = {};

    for (let currStat in totalStats) {
        if (statsToFilter[currStat]) {
            wantedStats[currStat] = totalStats[currStat];
        }
    }

    return wantedStats;
}

function translate(toBeTranslated) {
    let translated;

    if (typeof(toBeTranslated) === 'string') {
        translated = language[toBeTranslated];
    } else if (typeof(toBeTranslated) === 'object') {
        translated = {};

        Object.keys(toBeTranslated).forEach((currTranslation) => {
            translated[language[currTranslation]] = toBeTranslated[currTranslation];
        });
    }

    return translated;
}

function prettifyStats(stats, caption) {
    const fullCaption = translate(caption);
    let formattedStats = `*${fullCaption}*:\n\n`;

    const translatedStats = translate(stats);

    Object.keys(translatedStats).forEach((currStat) => {
        if (typeof(translatedStats[currStat]) !== 'object') {
            formattedStats += `*${currStat}*: ${translatedStats[currStat]}\n`;
        } else {
            formattedStats += `*${currStat}*: ${translatedStats[currStat]['mhfcValue']} _(${translatedStats[currStat]['avgValue']})_\n`;
        }
    });

    return formattedStats;
}