define(["lib-build/tpl!./MainMediaContainerMap",
    "lib-build/tpl!./MainMediaContainerMapTime",
        "lib-build/tpl!./MainMediaContainerImage",
        "lib-build/tpl!./MainMediaContainerEmbed",
        "lib-build/css!./MainStage",
        "../core/WebApplicationData",
        "csvHelper",
        "dojo/has",
        "esri/arcgis/utils",
        "esri/renderers/UniqueValueRenderer",
        "esri/geometry/Point",
        "esri/geometry/Extent",
        "esri/config",
        "esri/geometry/webMercatorUtils",
        "esri/symbols/SimpleMarkerSymbol",
        "esri/tasks/query",
        "dojo/topic",
        "dojo/on",
        "dojo/aspect",
        "dojo/_base/lang",
        "dojo/request",
        "dojo/dom-attr",
        "dojo/query"
],
    function (
        mainMediaContainerMapTpl, mainMediaContainerMapTimeTpl,mainMediaContainerImageTpl, mainMediaContainerEmbedTpl,
        viewCss,WebApplicationData,
        CsvHelper,
        has,arcgisUtils,UniqueValueRenderer,
        Point,
        Extent,
        esriConfig,
        webMercatorUtils,
        SimpleMarkerSymbol,
        Query,
        topic,
        on,
        aspect,
        lang,
        request, domAttr,dojoQuery
    ) {
        return function MainStage(container, isInBuilder, mainView) {
            var _this = this;
            _this.TimeMapsStoriesArray = [];
            _this.timerID = null;
            _this.playType = null;
            //
            // Media containers
            //
            function addTemporaryMainMediaContainer(webmap) {
                $("#mainStagePanel .medias").append(mainMediaContainerMapTpl({
                    webmapid: webmap,
                    isTemporary: true
                }));
            }

            this.updateMainMediaContainers = function () {
                var webmaps = app.data.getWebmaps(),
                    images = app.data.getImages(),
                    embeds = app.data.getEmbeds();
                //
                // Map
                //

                // Add new container
                $.each(webmaps, function (i, webmap) {
                    var result = $.grep(app.cfg.TIMESLIDERMAPS, function (e) { return e.webmapid === webmap; });
                    var mapContainer = $('.mapContainer[data-webmapid="' + webmap + '"]');
                    var idx = -1;
                    if (!mapContainer.length) {
                        //we have a custom time map
                        if (result.length > 0) {
                            idx = result[0].section;
                            _this.populateTimeSlider(idx, webmap);
                        } else {
                            $("#mainStagePanel .medias").append(mainMediaContainerMapTpl({
                                webmapid: webmap,
                                isTemporary: false,
                                timemap: idx
                            }));
                        }
                    }
                });
                // Remove unused container
                $('.mapContainer').each(function () {
                    if ($.inArray($(this).data('webmapid'), webmaps) == -1)
                        $(this).parent().remove();
                });
                //
                // Image
                //

                // Add new container
                $.each(images, function (i, imageUrl) {
                    var imageContainer = $('.imgContainer[data-src="' + imageUrl + '"]');
                    if (!imageContainer.length)
                        $("#mainStagePanel .medias").append(mainMediaContainerImageTpl({
                            url: imageUrl
                        }));
                });
                // Remove unused containers
                $('.imgContainer').each(function () {
                    if ($.inArray($(this).data('src'), images) == -1)
                        $(this).parent().remove();
                });
                //
                // Embed (video and webpage)
                //

                // Add new container
                $.each(embeds, function (i, embedInfo) {
                    // TODO this has to be reviewed to not allow content to be loaded too early? or give the same option for url?
                    var embedContainer = $('.embedContainer[data-src="' + (embedInfo.url || embedInfo.ts) + '"]');
                    if (!embedContainer.length) {

                        //
                        // Frametag are added straight to the dom without any container
                        //  a class and a data attribute are added below
                        // Ideally there should be a container so that it's possible to do more funny stuff like adding
                        //  multiple iframe but these makes it difficult to center the frame(s)
                        //

                        $("#mainStagePanel .medias").append(mainMediaContainerEmbedTpl({
                            url: embedInfo.url,
                            frameTag: embedInfo.frameTag,
                            // Introduced in V1.1
                            unload: !!(embedInfo.unload === undefined || embedInfo.unload)
                        }));

                        // If it's a frame tag
                        if (!!embedInfo.frameTag) {
                            // Find the Iframe
                            var frameTag = $("#mainStagePanel .medias .mainMediaContainer").last().find('iframe').first();

                            // Transform the src attribute into a data-src and Add the timestamp
                            frameTag.addClass('embedContainer')
                                .attr('data-src', frameTag.attr('src'))
                                .removeAttr('src')
                                .attr('data-ts', embedInfo.ts)
                                // Introduced in V1.1
                                .attr('data-unload', !!(embedInfo.unload === undefined || embedInfo.unload));
                        }
                    }
                });
                // Remove unused containers
                $('.embedContainer').each(function () {
                    var embedSRC = $(this).data('ts') || $(this).data('src');
                    var embedInUse = $.grep(embeds, function (embed) {
                        return embedSRC == embed.url || embedSRC == embed.ts;
                    }).length > 0;

                    if (!embedInUse)
                        $(this).parent().remove();
                });

                setMapControlsColor();
            };
            //CUSTOM TIME SLIDER ADDED TO MAIN AREA WITH MAP
            this.populateTimeSlider = function (idx,webmap) {
                require(["dojo/_base/array", "dojo/dom-construct","dojo/dom-style", "dojo/on", "dojo/dom-class"], function (array, domConstruct, domStyle, on, domClass) {
                    var filteredArr = array.filter(app.cfg.CSVFILES, function (item) {
                        return item.section == idx;
                    });
                    if (filteredArr.length=== 0) {
                        return;
                    }
                    var csvObj = filteredArr[0];
                    var historyFilePath = csvObj.path;
                    var path = location.pathname.replace(/[^\/]+$/, '');
                    var fileUrl = path + historyFilePath;
                    request(fileUrl).then(function (data) {
                        var localHistoryStory = new CsvHelper({
                            data: data
                        });
                        var textList = localHistoryStory.data;
                        var totalRecs = textList.length;
                        var startYear = csvObj.startYear;
                        var timeDataObj = {
                            section:idx,
                            webmapid: webmap,
                            textArray: localHistoryStory,
                            year:startYear
                        };
                        var mpContainerList = dojoQuery('.customSlider[data-webmapid="' + webmap + '"]');
                        var leftDiv = mpContainerList[0];
                        var playerDiv = dojoQuery(".player", leftDiv)[0];
                        _this.wirePlayerEvents(playerDiv);
                        var dataForecastDivList = dojoQuery(".DataForecast", leftDiv);
                        var dataForecastDiv = dataForecastDivList[0];
                        var dataRegDivList = dojoQuery(".DataReg", leftDiv);
                        var dataRegDiv = dataRegDivList[0];
                        var dataOnlyDivList = dojoQuery(".DataOnly", leftDiv);
                        var dataOnlyDiv = dataOnlyDivList[0];
                        var noDataDivList = dojoQuery(".NoData", leftDiv);
                        var noDataDiv = noDataDivList[0];
                        var dataForecastCount = 0;
                        var dataRegCount = 0;
                        var dataOnlyCount = 0;
                        var noDataCount = 0;
                        var dataForecastArr = [];
                        var dataRegArr = [];
                        var dataOnlyArr = [];
                        var noDataArr = [];

                        for (var j = 0; j < textList.length; j++) {
                            var record = textList[j];
                            var yr = parseInt(record.Year, 10);
                            var isStartYear = yr === startYear ? true : false;
                            var imgSource = isStartYear === true ? app.cfg.TIME_MARKER_ACTIVE : app.cfg.TIME_MARKER_INACTIVE;
                            var img = domConstruct.create("img", {
                                'src': imgSource,
                                'class': "timepoint",
                                'title': yr
                            });
                            if (isStartYear === true) {
                                domClass.add(img, 'isSelected');
                            }
                            on(img, "click", _this.yearClicked);
                            if (yr > 2014) {
                                dataForecastCount++;
                                domAttr.set(img, "data-hasData", true);
                                dataForecastArr.push(img);
                            } else if (yr > 2004) {
                                dataRegCount++;
                                domAttr.set(img, "data-hasData", true);
                                dataRegArr.push(img);
                            } else if (yr > 1984) {
                                dataOnlyCount++;
                                domAttr.set(img, "data-hasData", false);
                                dataOnlyArr.push(img);
                            } else {
                                noDataCount++;
                                domAttr.set(img, "data-hasData", false);
                                noDataArr.push(img);
                            }
                           
                        }
                        var leftDivHt = (leftDiv.offsetHeight) - 50; //50 for player
                    
                        domStyle.set(dataForecastDiv, "min-height", (dataForecastCount * 20) + "px");
                        var dataForecastHtPct = ((dataForecastCount / totalRecs)) * 100;
                        var dataRegHtPct = ((dataRegCount / totalRecs)) * 100;
                        domStyle.set(dataRegDiv, "min-height", (dataRegCount * 20) + "px");
                        var dataOnlyHtPct = ((dataOnlyCount / totalRecs)) * 100;
                        domStyle.set(dataOnlyDiv, "min-height", (dataOnlyCount * 20) + "px");
                        var noDataHtPct = ((noDataCount / totalRecs)) * 100;
                        domStyle.set(noDataDiv, "min-height", (noDataCount * 20) + "px");
                        var totalDivMinHt = (dataForecastCount * 20) + (dataRegCount * 20) + (dataOnlyCount * 20) + (noDataCount * 20);
                        var totalDiff = leftDivHt - totalDivMinHt;

                        _this.addYearToLine(dataForecastDiv, dataForecastCount, dataForecastArr, totalDiff, dataForecastHtPct,"2015");
                        _this.addYearToLine(dataRegDiv, dataRegCount, dataRegArr, totalDiff, dataRegHtPct,"2005");
                        _this.addYearToLine(dataOnlyDiv, dataOnlyCount, dataOnlyArr, totalDiff, dataOnlyHtPct,"1985");
                        _this.addYearToLine(noDataDiv, noDataCount, noDataArr, totalDiff, noDataHtPct,"1963");
                        app.data.setwebmapsTimeTextData(timeDataObj);
                        if (app.data._webmapsTimeTextArray.length === app.cfg.TIMESLIDERMAPS.length) {
                            _this.updateStoryForTimeMaps();
                        }
                    }, function (err) {
                        // handle an error condition
                        console.log('error: ' + err);
                    });
                    $("#mainStagePanel .medias").append(mainMediaContainerMapTimeTpl({
                        webmapid: webmap,
                        isTemporary: false,
                        timemap: idx
                    }));
                });
            };
            this.wirePlayerEvents = function (playerDiv) {
                var forwardImg = dojoQuery('.forward', playerDiv)[0];
                var pauseImg = dojoQuery('.pause', playerDiv)[0];
                var backImg = dojoQuery('.backward', playerDiv)[0];
                on(forwardImg, "click", _this.startTimerForward);
                on(pauseImg, "click", _this.stopTimer);
                on(backImg, "click", _this.startTimerBackward);
            };
            this.startTimerForward = function () {
                //var waitTime = app.cfg.TIME_PLAYER_MS;
                _this.playType = 'forward';
                _this.timerID = setInterval(_this.play, app.cfg.TIME_PLAYER_MS);
            };
            this.startTimerBackward = function () {
                _this.playType = 'backward';
                _this.timerID = setInterval(_this.play,app.cfg.TIME_PLAYER_MS);
            };
            this.play = function () {
                require(["dojo/query", "dojo/NodeList-traverse"], function(dojoQuery){
                    var selImg = dojoQuery(".isSelected")[0];
                    if (_this.playType === 'forward') {
                        var nextImg = dojoQuery(selImg).next()[0];
                        if (nextImg === null || nextImg ===undefined) {
                            var parDivF = dojoQuery(selImg).parent()[0];
                            if (parDivF !== null && parDivF !== undefined) {
                                var newParentDiv = dojoQuery(parDivF).next().next()[0];
                                nextImg = dojoQuery(newParentDiv).children('.timepoint').first()[0];
                            }
                        }
                        if (nextImg !== null && nextImg !==undefined) {
                            _this.updateTime(nextImg);
                        } else {
                            _this.stopTimer();
                        }
                    } else if (_this.playType === 'backward') {
                        var prevImg = dojoQuery(selImg).prev()[0];
                        if (prevImg === null || prevImg === undefined) {
                            var parDiv = dojoQuery(selImg).parent()[0];
                            if (parDiv !== null && parDiv !== undefined) {
                                var newParDiv = dojoQuery(parDiv).prev().prev()[0];
                                prevImg = dojoQuery(newParDiv).children('.timepoint').last()[0];
                            }
                            
                        }
                        if (prevImg !== null) {
                            _this.updateTime(prevImg);
                        } else {
                            _this.stopTimer();
                        }
                    }
                });
            };
            this.stopTimer = function () {
                console.log('stopping');
                clearInterval(_this.timerID);
                _this.timerID = null;
            };
            this.yearClicked = function (evt) {
                _this.updateTime(evt.target);
            };
            this.updateTime = function (img) {
                require(["dojo/_base/array", "dojo/dom-class"], function (array, domClass) {
                    var nl = dojoQuery(".isSelected");
                    array.forEach(nl, function (image) {
                        domClass.remove(image, 'isSelected');
                        domAttr.set(image, "src", app.cfg.TIME_MARKER_INACTIVE);
                    });
                    domClass.add(img, 'isSelected');
                    domAttr.set(img, "src", app.cfg.TIME_MARKER_ACTIVE);
                    var title = domAttr.get(img, "title");
                    var currentSection = app.data.getCurrentSectionIndex();
                    var timeStoriesArr = _this.TimeMapsStoriesArray;
                    var sectionTimeStoryArr = array.filter(timeStoriesArr, function (item) {
                        return item.section == currentSection;
                    });
                    var sectionTimeStory = sectionTimeStoryArr[0];
                    var yearinfoArr = sectionTimeStory.storyData;
                    var filteredArr = array.filter(yearinfoArr, function (record) {
                        return record.Year === title;
                    });
                    var updatedInfo = filteredArr[0];
                    domAttr.set(sectionTimeStory.dateDiv, "innerHTML", "<p>" + updatedInfo.Year + "</p>");
                    domAttr.set(sectionTimeStory.totalDiv, "innerHTML", "<p>" + "Acquiring..." + "</p>");
                    domAttr.set(sectionTimeStory.storyDiv, "innerHTML", "<p>" + updatedInfo.Info + "</p>");
                    _this.updateTimeLayer(updatedInfo.Year, sectionTimeStory.totalDiv);
                });
            };
            this.addYearToLine = function (div, count, arr,totalDiff, pct,avoidVal) {
                require(["dojo/_base/array", "dojo/dom-construct", "dojo/dom-style"], function (array, domConstruct, domStyle) {
                    //var marHt = ((pct / 100) * totalDiff) / (count);
                    var imgHt = 20;
                    var val = imgHt;
                    var arrCount = 0;
                    var topMarginVal = 0;
                    array.forEach(arr,function (image) {
                        var titleSel = domAttr.get(image, "title");
                        if (titleSel !== avoidVal) {
                            arrCount++;
                            topMarginVal = (val * arrCount);
                            domStyle.set(image, "margin-top", topMarginVal + "px");
                        } else {
                            topMarginVal = 0;
                            
                        }
                        domConstruct.place(image, div, "last");
                    });
                });
            };
            this.updateStoryForTimeMaps = function () {
                //initial population
                require(["dojo/_base/array"], function (array) {
                    var timeSections = app.data.getTimeSections();
                    var csvData = app.data.getwebmapsTimeTextData();
                    array.forEach(timeSections, function (record) {
                        var idx = record.sectionIndex;
                        var filteredArr = array.filter(csvData, function (item) {
                            return item.section == idx;
                        });
                        var csvElement = filteredArr[0];
                        var csvArr = array.filter(csvElement.textArray.data, function (item) {
                            return item.Year == csvElement.year;
                        });
                        //title will be the start year
                        var timeSectionDiv = dojoQuery('.timeSection[data-section="' + idx + '"]')[0];
                        var dateDiv = dojoQuery('.DateDiv', timeSectionDiv)[0];
                        var totalDiv = dojoQuery('.TotalDiv', timeSectionDiv)[0];
                        var storyDiv = dojoQuery('.StoryDiv', timeSectionDiv)[0];
                        domAttr.set(dateDiv, "innerHTML", "<p>" + csvElement.year + "</p>");
                        domAttr.set(totalDiv, "innerHTML", "<p>" + "Acquiring..." + "</p>");
                        domAttr.set(storyDiv, "innerHTML", "<p>" + csvArr[0].Info + "</p>");
                        //populate the time story array for updates
                        var timeStoryObj = {};
                        timeStoryObj.section = idx;
                        timeStoryObj.storyData = csvElement.textArray.data;
                        timeStoryObj.dateDiv = dateDiv;
                        timeStoryObj.totalDiv = totalDiv;
                        timeStoryObj.storyDiv = storyDiv;
                        _this.TimeMapsStoriesArray.push(timeStoryObj);
                    });
                });
            };
            this.updateTimeLayer = function (yr,totalDiv) {
                require(["dojo/_base/array", "esri/tasks/query", "esri/tasks/QueryTask","dojo/number"], function (array, EsriQuery, QueryTask,number) {
                    var map = app.map;
                    var featureLayerId = map.graphicsLayerIds[0];
                    var lyr = map.getLayer(featureLayerId);
                    var layerQueryTask = new QueryTask(lyr.url);
                    var q = new EsriQuery();
                    var outFieldArr = [];
                    var totFld=app.cfg.TIME_TOTAL_FIELD;
                    outFieldArr.push(totFld);
                    q.outFields = outFieldArr;
                    q.returnGeometry = false;
                    var queryExpr = app.cfg.TIME_YEAR_FIELD + "=" + yr;
                    q.where = queryExpr;
                    lyr.setDefinitionExpression(queryExpr);
                    layerQueryTask.execute(q, function (featureSet) {
                        if (featureSet.features.length > 0) {
                            var totalAmt = 0;
                            array.forEach(featureSet.features, function (feature) {
                                var val = feature.attributes[totFld];
                                totalAmt = totalAmt + val;
                            });
                            var num = number.format(totalAmt, {
                                places: 4,
                                pattern: '#'
                            });
                            domAttr.set(totalDiv, "innerHTML", "<p>Total NH3 is " + num + "</p>");
                        } else {
                            domAttr.set(totalDiv, "innerHTML", "<p>No data available</p>");
                        }
                    }, function (error) {
                        console.log('QUERY TASK ERROR',error);
                    });
                });
            };
            //END CUSTOM TIME SLIDER FUNCTIONALITY
            //
            // Management of Main Stage: all media
            //

            this.updateMainMediaWithStoryMainMedia = function (index) {
                var section = app.data.getStoryByIndex(index);
                if (section && section.media)
                    updateMainMedia(section.media, section, index);

                topic.publish("story-load-section", index);
            };

            this.updateMainMediaWithStoryAction = function (media) {
                updateMainMedia(media, app.data.getCurrentSection(), null);
            };

            function updateMainMedia(media, section, index) {
                // Refresh any iframe that would be the current Main Stage Media
                // If it's a video player this will stop current video playback 
                var activeFrame = $(".mainMediaContainer.active > iframe[data-unload=true]");
                if (activeFrame.length) {
                    setTimeout(function () {
                        activeFrame.attr('src', activeFrame.attr('src'));
                    }, 500);
                }

                // Fade out active container
                $(".mainMediaContainer.active").fadeOut();
                // Stop loading Indicator if running
                // From now only the Map has a loading indicator
                stopMainStageLoadingIndicator();

                if (media.type == "webmap")
                    updateMainMediaMaps(media.webmap.id, section, index, media);
                else if (media.type == "image")
                    updateMainMediaPicture(media.image.url, media.image.display);
                else if (media.type == "video")
                    updateMainMediaEmbed(media.video.url, media.video);
                else if (media.type == "webpage")
                    updateMainMediaEmbed(media.webpage.url || media.webpage.ts, media.webpage);
            }

            function startMainStageLoadingIndicator() {
                $('#mainStageLoadingIndicator').fadeIn();
            }

            function stopMainStageLoadingIndicator() {
                $('#mainStageLoadingIndicator').fadeOut();
            }

            //
            // Layout
            //

            this.updateMainStageWithLayoutSettings = function () {
                var appLayout = WebApplicationData.getLayoutId(),
                    appColors = app.data.getWebAppData().getColors(),
                    layoutCfg = WebApplicationData.getLayoutCfg(),
                    bodyWidth = $("body").width();

                // Resize embed that are have display fit
                styleMainStageEmbed();

                container.css("background-color", appColors.media);

                setMapControlsColor();

                if (appLayout == "float") {
                    var mapWidth = $("#contentPanel").width(),
                        panelPos = $("#floatingPanel").position(),
                        panelWidth = $("#floatingPanel").width(),
                        isLeft = layoutCfg.position == "left",
                        mapArea = isLeft ? mapWidth - (panelPos.left + panelWidth) : panelPos.left;

                    // Attribution
                    if (isLeft)
                        $(".mainMediaContainer.active .esriControlsBR").css({
                            left: panelPos.left + panelWidth + 5,
                            right: 'inherit'
                        });
                    else
                        $(".mainMediaContainer.active .esriControlsBR").css({
                            left: 'inherit',
                            right: mapWidth - panelPos.left + 5
                        });

                    // Map configuration, loading indicator and error
                    if (isLeft)
                        $(".mapConfigOverlay.position, .mapConfigOverlay.popup, #mainStageLoadingIndicator, .mainStageErrorContainer").css("left", panelPos.left + panelWidth + mapArea / 2);
                    else
                        $(".mapConfigOverlay.position, .mapConfigOverlay.popup, #mainStageLoadingIndicator, .mainStageErrorContainer").css("left", mapArea / 2);

                    if ($("body").hasClass("mobile-view"))
                        $("#mainStageLoadingIndicator, .mainStageErrorContainer").css("left", "50%");

                    //
                    // Center some components on the Main Stage space at the left or right of the panel
                    //

                    var panelIsRight = $("body").hasClass("layout-float-right"),
                        paddingDir = panelIsRight ? "padding-right" : "padding-left",
                        posDir = panelIsRight ? "right" : "left",
                        val = $("#floatingPanel").position().left;

                    if (panelIsRight)
                        val = bodyWidth - val;
                    else
                        val += $("#floatingPanel").width();

                    // Help, builder landing&quotes
                    $(".centerAlignOnFloat")
                        .css({
                            paddingRight: 0,
                            paddingLeft: 0
                        })
                        .css(paddingDir, val);

                    // Back button
                    $(".mediaBackContainer")
                        .css({
                            left: 'inherit',
                            right: 'inherit'
                        })
                        .css(posDir, val + mapArea / 2);

                    // Help goes over the floating panel when screen too small 
                    if (bodyWidth <= 1067)
                        $("#builderHelp").css(paddingDir, 0);

                    // Main Stage Images that are centered
                    $(".mainMediaContainer .imgContainer.center")
                        .css({
                            left: 0,
                            right: 0
                        })
                        .css(posDir, val);

                    // Main Stage video&embed that are centered
                    $(".mainMediaContainer .embedContainer.center")
                        .css({
                            left: 0,
                            right: 0
                        })
                        .css(posDir, val);

                    // Main Stage video&embed that are custom
                    $(".mainMediaContainer .embedContainer.custom")
                        .css({
                            left: 0,
                            right: 0
                        })
                        .css(posDir, val);
                }
                    // Side Panel
                else {
                    // Attribution
                    $(".mainMediaContainer.active .esriControlsBR").css({
                        left: "",
                        right: ""
                    });

                    // Map configuration, loading indicator and error
                    $(".mapConfigOverlay.position, .mapConfigOverlay.popup, #mainStageLoadingIndicator, .mainStageErrorContainer").css("left", "50%");

                    // Reset centering that may have been done if user has changed layouts
                    $(".centerAlignOnFloat").css({
                        paddingRight: 0,
                        paddingLeft: 0
                    });
                    $(".mediaBackContainer").css({
                        left: '50%',
                        right: 'inherit'
                    });
                    $(".mainMediaContainer .imgContainer.center").css({
                        left: 0,
                        right: 0
                    });
                    $(".mainMediaContainer .embedContainer.center").css({
                        left: 0,
                        right: 0
                    });
                    $(".mainMediaContainer .embedContainer.custom").css({
                        left: 0,
                        right: 0
                    });
                }
            };

            //
            // Management of Main Stage: map
            //

            // TODO params of the next two function has to be cleanedup
            function updateMainMediaMaps(newWebmapId, section, index, media) {
                //var currentWebmapId = $('.mapContainer:visible').data('webmapid');

                var mapContainer = $('.mapContainer[data-webmapid="' + newWebmapId + '"]');
                $('.mainMediaContainer').removeClass("active has-error");
                mapContainer.parent().addClass("active");

                if (newWebmapId) {
                    // The map has already been loaded
                    if (mapContainer.hasClass('map')) {
                        var extentBeforeUpdate = app.map ? app.map.extent : null;
                        
                        app.map = app.maps[newWebmapId].response.map;
                        app.mapItem = app.maps[newWebmapId].response.itemInfo;
                        app.mapConfig = app.maps[newWebmapId];

                        updateMainMediaMapsStep2(
                            mapContainer,
                            section,
                            extentBeforeUpdate,
                            index,
                            media,
                            true
                        );
                    }
                        // Need to load the map
                    else {
                        startMainStageLoadingIndicator();

                        // Get the extent to be used to load the webmap
                        var extent = media && media.webmap ? media.webmap.extent : null;
                        if (extent) {
                            try {
                                extent = new Extent(extent);
                            } catch (e) {
                                extent = null;
                            }
                        }

                        mainView.loadWebmap(newWebmapId, mapContainer[0], extent).then(
                            lang.hitch(_this, function (response) {
                                var extentBeforeUpdate = app.map ? app.map.extent : null;

                                app.maps[newWebmapId] = mainView.getMapConfig(response, mapContainer);
                                app.map = response.map;
                                //update for time maps
                                var result = $.grep(app.cfg.TIMESLIDERMAPS, function (e) { return e.webmapid === newWebmapId; });
                                if (result.length > 0) {
                                    var csvResult = $.grep(app.cfg.CSVFILES, function (e) { return e.webmapid === newWebmapId; });
                                    if (csvResult.length > 0) {
                                    	var yr = csvResult[0].startYear;
                                        var timeStoriesArr = _this.TimeMapsStoriesArray;
                                        require(["dojo/_base/array"], function (array) {
                                            if (timeStoriesArr.length > 0) {
                                                var currentSection = app.data.getCurrentSectionIndex();
                                                var sectionTimeStoryArr = array.filter(timeStoriesArr, function (item) {
                                                    return item.section == currentSection;
                                                });
                                                var sectionTimeStory = sectionTimeStoryArr[0];
                                                var div = sectionTimeStory.totalDiv;
                                                console.log('GOT DIV');
                                                _this.updateTimeLayer(yr,div);
                                            } else {
                                                console.log('NO GOT DIV');
                                                _this.updateTimeLayer(yr);
                                            }
                                        });
                                    
                                    }
                                }
                                app.mapItem = app.maps[newWebmapId].response.itemInfo;
                                app.mapConfig = app.maps[newWebmapId];

                                // Popup
                                if (app.map.infoWindow) {
                                    $(app.map.infoWindow.domNode).addClass("light");
                                    app.map.infoWindow.markerSymbol = new SimpleMarkerSymbol().setSize(0);
                                }

                                updateMainMediaMapsStep2(
                                    mapContainer,
                                    section,
                                    extentBeforeUpdate,
                                    index,
                                    media,
                                    false
                                );

                                //
                                // Register events for the builder
                                //  because we need to know for Map Configuration what is the intended extent 
                                //  before the zoom when there is lods (the resulting extent will always be different)
                                //
                                if (isInBuilder) {
                                    // can't use update-end as it's not correct value for setExtent when lods
                                    app.ignoreNextEvent = false;
                                    aspect.before(app.map, "setExtent", function (extent) {
                                        if (!app.ignoreNextEvent) {
                                            app.lastExtentSet = extent;
                                            // A pan or zoom will also be triggered
                                            app.ignoreNextEvent = true;
                                        }
                                    });

                                    var handle = app.map.on("update-end", function () {
                                        handle.remove();
                                        app.lastExtentSet = app.map.extent;
                                        // store the initial extent in a new property 
                                        // TODO is that necessary? to not mess with browser resize and init map extent?
                                        //app.map._params.extent = app.map.extent;
                                        app.map.mapJournalInitExtent = app.map.extent;
                                        app.ignoreNextEvent = true;
                                    });

                                    var onPanOrZoomEnd = function (e) {
                                        if (!app.ignoreNextEvent)
                                            app.lastExtentSet = e.extent;
                                        else
                                            app.ignoreNextEvent = false;
                                    };
                                    app.map.on("zoom-end", onPanOrZoomEnd);
                                    app.map.on("pan-end", onPanOrZoomEnd);
                                }

                                setTimeout(function () {
                                    stopMainStageLoadingIndicator();
                                }, 50);

                                mapContainer.parent().removeClass("has-error");
                            }),
                            lang.hitch(_this, function () {
                                stopMainStageLoadingIndicator();
                                mapContainer.parent().addClass("has-error");
                                mapContainer.parent().find('.error').html(i18n.viewer.errors.mapLoadingFail);

                                topic.publish("story-loaded-map", {
                                    id: newWebmapId,
                                    index: index
                                });
                                topic.publish("ADDEDIT_LOAD_WEBMAP_FAIL");
                            })
                        );

                        // Publish an early loaded after two second in case the map is slow to load 
                        setTimeout(function () {
                            topic.publish("story-section-map-timeout");
                        }, 2000);
                    }
                }
            }

            function updateMainMediaMapsStep2(mapContainer, section, oldExtent, index, media, notFirstLoad) {
                _this.updateMainStageWithLayoutSettings();
                setMapControlsColor();

                //app.data.debug();

                if (WebApplicationData.getLayoutId() == "float")
                    app.map.disableKeyboardNavigation();
                else
                    app.map.enableKeyboardNavigation();

                try {
                    app.map.resize();
                    app.map.reposition();
                } catch (e) { }

                // If this is a story section
                if (section || media) {
                    //
                    // Layers
                    //

                    //  - Array of {id:'', visible:''} for the overrided layers (compared to the webmap initial state)
                    //  - Only overrided layers are present there to allow the webmap to evolve outside of the app
                    //     - If default visibility of layers are changed outside of the app, all view that didn't override the value will see the change
                    //     - if the webmap evolve the array may reference deleted layers. That's cleaned anytime user open the Configure map View and Save
                    var layerCfg = media && media.webmap ? media.webmap.layers : null,
                        mapDefault = app.maps[media.webmap.id].response.itemInfo.itemData.operationalLayers;

                    // Loop through webmap layers and set the visibility
                    // The visibility is set to the section definition when defined or to the webmap initial visibility
                    $.each(mapDefault, function (i, layer) {
                        var override;

                        if (layer.layerObject) {
                            override = $(layerCfg).filter(function (i, l) {
                                return l.id == layer.layerObject.id;
                            });
                            layer.layerObject.setVisibility(override.length ? override[0].visibility : layer.visibility);
                        } else if (layer.featureCollection && layer.featureCollection.layers) {
                            $.each(layer.featureCollection.layers, function (i, fcLayer) {
                                override = $(layerCfg).filter(function (i, l) {
                                    // Because the configuration store the map layerObject id like "mapNotes_914_0" instead of "mapNotes_914"
                                    // Should change that and keep V1.0 compatibility
                                    return l.id.split('_').slice(0, -1).join('_') == fcLayer.layerObject.id.split('_').slice(0, -1).join('_');
                                });
                                fcLayer.layerObject.setVisibility(override.length ? override[0].visibility : fcLayer.visibility);
                            });
                        }
                    });

                    //
                    // Extent
                    //

                    var extent = media && media.webmap ? media.webmap.extent : null;
                    if (extent) {
                        try {
                            extent = new Extent(extent);
                        } catch (e) {
                            //
                        }
                    }

                    // Get back to the home section and section is configured to web map default
                    if (!extent && notFirstLoad && index === 0) {
                        extent = app.map._params.extent;
                    }

                    if (extent)
                        app.map.setExtent(extent /*, true*/).then(function () {
                            applyPopupConfiguration(media.webmap.popup, index);
                            topic.publish("story-loaded-map", {
                                id: media.webmap.id,
                                index: index
                            });
                        }); // TODO has at least to use _core.setExtent
                    else
                        topic.publish("story-loaded-map", {
                            id: media.webmap.id,
                            index: index
                        });

                    /*
                    // Reuse the current extent
                    else if( oldExtent )
                        app.map.setExtent(oldExtent);
                    */

                    //
                    // Map Controls
                    //

                    var overviewSettings = media.webmap.overview || {},
                        legendSettings = media.webmap.legend || {};

                    // If it's a Main Stage Action, look to use the section Main Stage media 
                    //  configuration IF it's a webmap 
                    if (index === null && section.media && section.media.webmap) {
                        overviewSettings = section.media.webmap.overview || {},
                            legendSettings = section.media.webmap.legend || {};
                    }

                    if (overviewSettings.enable !== undefined) {
                        app.maps[media.webmap.id].overview.toggle(overviewSettings.enable, WebApplicationData.getColors());
                        app.maps[media.webmap.id].overview.toggleExpanded(overviewSettings.openByDefault);
                        app.maps[media.webmap.id].overview.setSettings(overviewSettings);
                    }

                    if (legendSettings.enable !== undefined) {
                        app.maps[media.webmap.id].legend.toggle(legendSettings.enable);
                        app.maps[media.webmap.id].legend.toggleExpanded(legendSettings.openByDefault);
                        app.maps[media.webmap.id].legend.setSettings(legendSettings);
                    }
                    /*	*/
                    //
                    // Popup
                    //

                    if (!extent)
                        applyPopupConfiguration(media.webmap.popup, index);
                    // Otherwise called through extent change callback

                } else
                    topic.publish("ADDEDIT_WEBMAP_DONE");
            }

            function applyPopupConfiguration(popupCfg, index) {
                // When an action is performed the popup will be closed
                // But features aren't cleared so it can be restored
                app.map.infoWindow.hide();

                if (popupCfg) {
                    var layer = app.map.getLayer(popupCfg.layerId);

                    app.map.infoWindow.clearFeatures();

                    if (layer)
                        applyPopupConfigurationStep2(popupCfg, index);
                        // On FS the layer will be null until loaded...
                    else
                        var handle = app.map.on("update-end", function () {
                            applyPopupConfiguration(popupCfg, index);
                            handle.remove();
                        });
                }
            }

            function applyPopupConfigurationStep2(popupCfg, index) {
                var query = new Query(),
                    layer = app.map.getLayer(popupCfg.layerId);

                if (!layer)
                    return;

                query.objectIds = [popupCfg.fieldValue];

                // Feature Service
                if (!layer._collection) {
                    query.returnGeometry = true;
                    query.outFields = ["*"]; // popupCfg.fieldName ?
                    query.outSpatialReference = app.map.spatialReference;
                }

                layer.queryFeatures(query).then(function (featureSet) {
                    applyPopupConfigurationStep3(featureSet.features, index);
                });
            }

            function applyPopupConfigurationStep3(features, index) {
                if (!features || !features.length)
                    return;

                var geom = features[0].geometry,
                    center = geom.getExtent() ? geom.getExtent().getCenter() : geom;

                app.map.infoWindow.setFeatures(features);
                app.map.infoWindow.show(center);

                // Center the map is the geometry isn't visible
                if (!app.map.extent.contains(center)) {
                    app.map.centerAt(center);
                    // Show back btn only if it's a Main Stage action
                    if (index === null) {
                        $('.mediaBackContainer')
                            .show()
                            .css("marginLeft", -$(".mediaBackContainer .backButton").outerWidth() / 2)
                            .css("marginRight", -$(".mediaBackContainer .backButton").outerWidth() / 2);
                    }
                }
            }

            function setMapControlsColor() {
                if (app.mapConfig) {
                    var appColors = app.data.getWebAppData().getColors();
                    app.mapConfig.overview.setColors(appColors);
                    app.mapConfig.legend.setColors(appColors);
                }
            }

            // Builder events

            this.showWebmapById = function (webmapId) {
                updateMainMediaMaps(webmapId, null, null, null);
            };

            this.loadTmpWebmap = function (webmapId) {
                if (!$('.mapContainer[data-webmapid="' + webmapId + '"]').length)
                    addTemporaryMainMediaContainer(webmapId);

                updateMainMediaMaps(webmapId, null, null, null);
            };

            //
            // Management of Main Stage: picture
            //

            function updateMainMediaPicture(url, display) {
                $('.mainMediaContainer').removeClass('active');
                var pictureContainer = $('.imgContainer[data-src="' + url + '"]');
                if (pictureContainer) {
                    pictureContainer
                        .removeClass("center fit fill stretch")
                        .addClass(display)
                        .css({
                            left: 0,
                            right: 0
                        })
                        .css('background-image', 'url("' + pictureContainer.data('src') + '")');

                    _this.updateMainStageWithLayoutSettings();

                    pictureContainer.parent().addClass('active');
                }
            }

            //
            // Management of Main Stage: embed (video and webpage) 
            //

            function updateMainMediaEmbed(url, cfg) {
                $('.mainMediaContainer').removeClass('active');

                // URL can be an URL or the timestamp in case of an iframe tag
                var embedContainer = $('.embedContainer[data-src="' + url + '"]');

                // Not found, must be an iframe tag
                if (!embedContainer.length) {
                    embedContainer = $('.embedContainer[data-ts="' + url + '"]');
                    // The correct URL is in data-src
                    url = embedContainer.data('src');
                }

                if (embedContainer.length) {
                    embedContainer
                        .removeClass("center fit fill stretch")
                        .addClass(cfg.display)
                        .attr("data-unload", cfg.unload === undefined || cfg.unload)
                        .css({
                            left: 0,
                            right: 0
                        });

                    // TODO this fail if no src attr is set on the iframe (srcdoc)
                    //  as a workaround <iframe srcdoc="http://" src="about:blank></iframe>
                    if (!embedContainer.attr('src'))
                        // TODO youtube recommand an origin param "&origin=" + encodeURIComponent(document.location.origin)
                        // https://developers.google.com/youtube/iframe_api_reference#Loading_a_Video_Player
                        embedContainer.attr('src', url);

                    var width = cfg.width || '560',
                        height = cfg.height || '315';

                    // Done trough CSS and JS on resize
                    if (cfg.display == "fit") {
                        width = "";
                        height = "";
                    }

                    if (width) {
                        if (!width.match(/[0-9]+%/))
                            width = width + 'px';
                        embedContainer.attr('width', width);
                    }
                    if (height) {
                        if (!height.match(/[0-9]+%/))
                            height = height + 'px';
                        embedContainer.attr('height', height);
                    }

                    embedContainer.parent().addClass('active');
                    _this.updateMainStageWithLayoutSettings();
                }
            }

            function styleMainStageEmbed() {
                $(".mainMediaContainer.active iframe.embedContainer.fit").attr(
                    "height",
                    $("#mainStagePanel").width() * 9 / 16
                );
            }
        };
    }
);