"use strict";
// 配置区：分组、请求、站点、筛选、阅读规则和源入口均在此声明。

const websiteGroups = {"novel": "小说", "biquge": "笔趣阁", "comic": "漫画"};

const requestHeaders = {
  "iPhone": {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1"},
  "quanben": {"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1", "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Accept-Language": "zh-CN,zh;q=0.9", "Accept-Encoding": "identity"},
  "shuhaige": {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36", "Referer": "https://www.shuhaige.net/", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"}
};

const catalogTemplates = {
  "coverCards": {
    "items": ".box.hot dl",
    "fields": {
      "title": {"selector": "h3 a"},
      "link": {"selector": "h3 a", "attribute": "href"},
      "author": {"selector": ".book_other span"},
      "status": {"selector": ".book_other:contains(状态)"},
      "cover": {"selector": "dt img", "attribute": "src"}
    },
    "attributes": [{"name": "状态", "field": "status", "pattern": /状态[：:]\s*(连载中|连载|已完结|完结|已完本|完本)/}],
    "titlePattern": /^\[[^\]]+\]/
  },
  "biqugeCards": {
    "items": ".book-coverlist",
    "fields": {
      "title": {"selector": "h4 a"},
      "link": {"selector": "h4 a", "attribute": "href"},
      "author": {"selector": ".caption small"},
      "summary": {"selector": ".caption p"},
      "coverStyle": {"selector": "a.thumbnail", "attribute": "style"}
    },
    "coverPattern": /url\(\s*([\'"]?)(.*?)\1\s*\)/i
  },
  "gutenberg": {
    "items": "li.booklink",
    "fields": {
      "title": {"selector": ".title"},
      "link": {"selector": "a.link", "attribute": "href"},
      "author": {"selector": ".subtitle"},
      "cover": {"selector": "img.cover-thumb", "attribute": "src"}
    }
  }
};

const catalogDefaults = {
  "links": {
    "items": "a[href]",
    "fields": {
      "href": {"selector": "", "attribute": "href"},
      "text": {"selector": ""}
    }
  },
  "nextPagePattern": /^(下一页|下页|Next|›|>)$/i,
  "defaultPagePattern": /[?&](?:page|p)=(\d+)/i,
  "verificationTitlePattern": /<title>[^<]*(验证码|Just a moment|Attention Required)/i
};

const readingDefaults = {
  "chapterPattern": /^(https:\/\/[^?#]+\/\d+)(?:_(\d+))?\.html$/,
  "directoryPagePattern": /\/index_(\d+)\.html$/,
  "directoryLinks": ".pagination a[href]",
  "directoryOptions": {
    "items": "select option",
    "fields": {
      "href": {"selector": "", "attribute": "value"}
    }
  },
  "metadata": {
    "items": "html",
    "fields": {
      "title": {"selector": "meta[property=\"og:novel:book_name\"]", "attribute": "content"},
      "heading": {"selector": "h1"},
      "author": {"selector": "meta[property=\"og:novel:author\"]", "attribute": "content"},
      "plainAuthor": {"selector": ".pic_txt_list .author"},
      "summary": {"selector": "meta[property=\"og:description\"]", "attribute": "content"},
      "intro": {"selector": "#intro"},
      "description": {"selector": ".description"},
      "cover": {"selector": "meta[property=\"og:image\"]", "attribute": "content"},
      "plainCover": {"selector": ".pic_txt_list .pic img", "attribute": "src"},
      "category": {"selector": "meta[property=\"og:novel:category\"]", "attribute": "content"},
      "status": {"selector": "meta[property=\"og:novel:status\"]", "attribute": "content"},
      "updated": {"selector": "meta[property=\"og:novel:update_time\"]", "attribute": "content"}
    }
  },
  "attributes": [
    {"name": "分类", "field": "category"},
    {"name": "状态", "field": "status"},
    {"name": "更新时间", "field": "updated"}
  ],
  "remove": ["script", "style", "iframe", "#ad", ".appguide-btns"],
  "ignoredParagraphs": [
    /^第\(\d+\/\d+\)页$/,
    /^\(本章完\)$/,
    /^本章未完，请点击下一页继续阅读$/
  ],
  "nextVariablePattern": /\bvar\s+hhekgsv\s*=\s*([\'"])([^\'"\\]*)\1\s*;/
};

const websiteRules = {
  "kgbook": {
    "id": "kgbook",
    "name": "苦瓜书盘",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://kgbook.com/",
    "domains": ["kgbook.com"],
    "capabilities": ["home", "search", "detail", "resources", "catalog"],
    "parser": "html",
    "home": {
      "type": "html",
      "request": {"url": "{homepage}", "validateResponse": false},
      "sections": [
        {
          "id": "recommended",
          "title": "",
          "tabTitle": "推荐",
          "rows": {
            "items": "#recommendation li",
            "fields": {
              "title": {"selector": "a", "attribute": "title"},
              "link": {"selector": "a", "attribute": "href"},
              "cover": {"selector": "img", "attribute": "src"}
            }
          }
        },
        {
          "id": "latest",
          "title": "",
          "tabTitle": "最新",
          "rows": {
            "items": ".channel-item",
            "fields": {
              "title": {"selector": ".list-title a", "attribute": "title"},
              "link": {"selector": ".list-title a", "attribute": "href"},
              "author": {"selector": ".list-author"},
              "summary": {"selector": ".list-content"}
            }
          }
        },
        {
          "id": "popular",
          "title": "",
          "tabTitle": "热门",
          "rows": {
            "items": ".hotdownloads li",
            "fields": {
              "title": {"selector": "a", "attribute": "title"},
              "link": {"selector": "a", "attribute": "href"}
            }
          }
        }
      ]
    },
    "catalog": {
      "filters": [
        {
          "id": "category",
          "title": "分类",
          "defaultValue": "all",
          "options": [
            {"value": "all", "title": "全部"},
            {"value": "xiandaiwenxue", "title": "现代文学"},
            {"value": "gudianwenxue", "title": "古典文学"},
            {"value": "wuxiaxiaoshuo", "title": "武侠小说"},
            {"value": "wangluoxiaoshuo", "title": "网络小说"},
            {"value": "yanqingxiaoshuo", "title": "言情小说"},
            {"value": "zhichangxiaoshuo", "title": "职场小说"},
            {"value": "kehuanxuanhuan", "title": "科幻玄幻"},
            {"value": "tuilijingsong", "title": "推理惊悚"},
            {"value": "renwensheke", "title": "人文社科"},
            {"value": "renwuchuanji", "title": "人物传记"},
            {"value": "waiguowenxue", "title": "外国文学"},
            {"value": "jinrongtouzi", "title": "金融投资"},
            {"value": "guanlishuji", "title": "管理书籍"},
            {"value": "lizhichenggong", "title": "励志成功"},
            {"value": "lishidili", "title": "历史地理"},
            {"value": "zhanzhengjunshi", "title": "战争军事"},
            {"value": "zhexuezongjiao", "title": "哲学宗教"},
            {"value": "ertongwenxue", "title": "儿童文学"},
            {"value": "shigesanwen", "title": "诗歌散文"},
            {"value": "zirankexue", "title": "自然科学"},
            {"value": "jiaoyuxuexi", "title": "教育学习"},
            {"value": "diannaowangluo", "title": "电脑网络"},
            {"value": "baojianyangsheng", "title": "保健养生"},
            {"value": "shenghuoxiuxian", "title": "生活休闲"},
            {"value": "qikanzazhi", "title": "期刊杂志"},
            {"value": "gongjushu", "title": "工具书"},
            {"value": "dianzishuzhizuo", "title": "电子书制作"}
          ]
        },
        {
          "id": "sort",
          "title": "排序",
          "defaultValue": "default",
          "options": [
            {"value": "default", "title": "默认"},
            {"value": "latest", "title": "最新"},
            {
              "value": "popular",
              "title": "热门",
              "when": {"category": "all"}
            }
          ]
        }
      ],
      "searchFilters": [
        {
          "id": "field",
          "title": "范围",
          "defaultValue": "all",
          "options": [
            {"value": "all", "title": "书名与作者"},
            {"value": "title", "title": "书名"},
            {"value": "bookwriter", "title": "作者"}
          ]
        }
      ],
      "library": {
        "sections": [
          {
            "when": {"category": "all", "sort": "popular"},
            "id": "popular"
          },
          {
            "when": {"category": "all", "sort": "default"},
            "id": "recommended"
          }
        ],
        "request": [
          {
            "when": {"category": "all"},
            "url": "{homepage}list/"
          },
          {"url": "{homepage}{category}/"}
        ],
        "rows": {
          "items": ".channel-item",
          "fields": {
            "title": {"selector": ".list-title a", "attribute": "title"},
            "link": {"selector": ".list-title a", "attribute": "href"},
            "author": {"selector": ".list-author"},
            "summary": {"selector": ".list-content"}
          }
        },
        "pagination": {"mode": "next", "label": "下一页"}
      },
      "search": {
        "request": {
          "url": "{homepage}e/search/index.php",
          "method": "POST",
          "form": {"keyboard": "{query}", "show": "{field}", "tbname": "download", "tempid": "1"},
          "values": {
            "field": {"all": "title,booksay,bookwriter"}
          }
        },
        "rows": {
          "items": "#slist > li",
          "fields": {
            "title": {"selector": "h1 a"},
            "link": {"selector": "h1 a", "attribute": "href"},
            "summary": {"selector": ".text"}
          }
        },
        "pagination": {"mode": "next", "label": "下一页"}
      }
    },
    "detail": {
      "handler": kgbookDetail,
      "items": "#content",
      "fields": {
        "title": {"selector": "h1.news_title"},
        "cover": {"selector": "#news_picture img", "attribute": "src"},
        "summary": {"selector": "#introduction > p"}
      },
      "attributes": {
        "items": "#news_details li",
        "fields": {
          "text": {"selector": ""},
          "rating": {"selector": "img", "attribute": "src"}
        }
      },
      "resources": {
        "items": "#introduction a[href*=\"/e/DownSys/\"]",
        "fields": {
          "title": {"selector": ""},
          "url": {"selector": "", "attribute": "href"}
        }
      }
    },
    "search": {
      "request": {
        "url": "{homepage}e/search/index.php",
        "method": "POST",
        "form": {"keyboard": "{query}", "show": "{field}", "tbname": "download", "tempid": "1"},
        "values": {
          "field": {"all": "title,booksay,bookwriter"}
        },
        "headers": {"Referer": "https://kgbook.com/"},
        "validateResponse": false
      },
      "rows": {
        "items": "#slist > li",
        "fields": {
          "title": {"selector": "h1 a"},
          "link": {"selector": "h1 a", "attribute": "href"},
          "summary": {"selector": ".text"}
        }
      },
      "expectedStatus": 200,
      "error": "Search unavailable"
    }
  },
  "fanqie": {
    "id": "fanqie",
    "name": "番茄小说",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://fanqienovel.com/",
    "domains": ["fanqienovel.com", "byteimg.com", "bytetos.com"],
    "capabilities": ["home", "detail", "content", "search"],
    "parser": "fanqie",
    "home": {
      "type": "fanqie",
      "sections": [
        {"id": "editor", "title": "编辑推荐", "tabTitle": "推荐", "key": "editorList"},
        {"id": "weekly", "title": "一周推荐", "tabTitle": "热门", "key": "weekList"},
        {"id": "male", "title": "男频精选", "tabTitle": "男频", "key": "boyList"},
        {"id": "female", "title": "女频精选", "tabTitle": "女频", "key": "girlList"}
      ],
      "detailURL": "{homepage}page/{bookID}",
      "request": {"url": "{homepage}", "validateResponse": false}
    },
    "reading": {
      "chapterItems": ".page-directory-content .chapter-item",
      "chapterTitle": {"selector": "a.chapter-item-title"},
      "chapterLink": {"selector": "a.chapter-item-title", "attribute": "href"},
      "content": ".muye-reader-content",
      "contentTitle": {"selector": ".muye-reader-title"},
      "font": "embeddedOpenType"
    },
    "search": {
      "handler": fanqieSearch,
      "pageURL": "{homepage}search/{query}",
      "request": {"url": "{homepage}api/author/search/search_book/v1?query_word={query}&page_count=10&page_index={pageIndex}&query_type=0&filter=127,127,127,127"},
      "detailURL": "{homepage}page/{bookID}",
      "limit": 10
    }
  },
  "sfnovel": {
    "id": "sfnovel",
    "name": "SF轻小说",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://book.sfacg.com/",
    "domains": ["sfacg.com"],
    "capabilities": ["home", "detail", "content", "search"],
    "parser": "html",
    "home": {
      "type": "html",
      "request": {"url": "{homepage}", "validateResponse": false},
      "sections": [
        {
          "id": "recommended",
          "title": "人气推荐",
          "tabTitle": "推荐",
          "rows": {
            "items": "a[href^=/Novel/]:has(img)",
            "fields": {
              "title": {"selector": "img", "attribute": "alt"},
              "link": {"selector": "", "attribute": "href"},
              "cover": {"selector": "img", "attribute": "data-original", "useHTTPS": true}
            }
          }
        }
      ]
    },
    "reading": {
      "catalogLink": {"selector": "a[href$=\"/MainIndex/\"]", "attribute": "href"},
      "chapterItems": ".catalog-list li",
      "chapterTitle": {"selector": "a", "attribute": "title"},
      "chapterLink": {"selector": "a", "attribute": "href"},
      "lockedSelector": ".icn_vip",
      "content": "#ChapterBody",
      "contentTitle": {"selector": ".article-title"}
    },
    "search": {
      "request": {"url": "https://s.sfacg.com/?Key={query}&S=1&SS=0&PageIndex={page}", "validateResponse": false},
      "rows": {
        "items": "ul:has(a[id*=ResultList_LinkInfo])",
        "fields": {
          "title": {"selector": "a[id*=ResultList_LinkInfo]"},
          "link": {"selector": "a[id*=ResultList_LinkInfo]", "attribute": "href"},
          "cover": {"selector": "img", "attribute": "src"}
        }
      }
    }
  },
  "mox": {
    "id": "mox",
    "name": "Kmoe",
    "kind": "comic",
    "group": "comic",
    "homepage": "https://mox.moe/",
    "domains": ["mox.moe", "kzz.moe"],
    "capabilities": ["home", "search"],
    "parser": "mox",
    "home": {
      "type": "mox",
      "literalMarker": "disp_divinfo(",
      "id": "recommended",
      "title": "热门漫画",
      "tabTitle": "推荐",
      "request": {"url": "{homepage}", "validateResponse": false}
    },
    "search": {
      "handler": moxSearch,
      "request": {"url": "https://kzz.moe/list.php?s={query}&page={page}", "validateResponse": false}
    }
  },
  "kuaikan": {
    "id": "kuaikan",
    "name": "快看漫画",
    "kind": "comic",
    "group": "comic",
    "homepage": "https://www.kuaikanmanhua.com/",
    "domains": ["kuaikanmanhua.com", "v3mh.com", "kkmh.com"],
    "capabilities": ["home", "search", "detail", "content"],
    "parser": "html",
    "home": {
      "type": "html",
      "request": {"url": "{homepage}", "validateResponse": false},
      "sections": [
        {
          "id": "recommended",
          "title": "人气推荐",
          "tabTitle": "推荐",
          "rows": {
            "items": "div.items:has(a.tabLink)",
            "fields": {
              "title": {"selector": ".itemTitle"},
              "link": {"selector": "a.tabLink", "attribute": "href"},
              "cover": {"selector": "img[src^=https]", "attribute": "src"},
              "author": {"selector": ".itemFooter .left"}
            }
          }
        }
      ]
    },
    "search": {
      "handler": kuaikanSearch,
      "request": {
        "url": "{homepage}search/web/complex?q={query}&f=3",
        "headers": {"Referer": "https://www.kuaikanmanhua.com/", "User-Agent-PC": "PCKuaikan/1.0.0/100000(Macintosh;10.15.7;Safari;pckuaikan;1800*2880;0)", "Mini-Id": "pckuaikan:default", "X-Device": "default"},
        "validateResponse": false
      },
      "detailURL": "{homepage}web/topic/{bookID}"
    },
    "detail": {
      "handler": kuaikanDetail
    },
    "reading": {
      "handler": kuaikanContent,
      "chapterURL": "{homepage}web/comic/{chapterID}"
    }
  },
  "qqcomics": {
    "id": "qqcomics",
    "name": "腾讯动漫",
    "kind": "comic",
    "group": "comic",
    "homepage": "https://ac.qq.com/",
    "domains": ["qq.com", "acimg.cn"],
    "capabilities": ["home", "search", "detail", "content"],
    "parser": "html",
    "home": {
      "type": "html",
      "request": {"url": "{homepage}", "validateResponse": false},
      "sections": [
        {
          "id": "recommended",
          "title": "强档推荐",
          "tabTitle": "推荐",
          "rows": {
            "items": "a[href*=/Comic/ComicInfo/id/]:has(img)",
            "fields": {
              "title": {"selector": "img", "attribute": "alt"},
              "link": {"selector": "", "attribute": "href"},
              "cover": {"selector": "img", "attribute": "data-original"}
            }
          }
        }
      ]
    },
    "search": {
      "request": {"url": "{homepage}Comic/searchList/search/{query}/page/{page}", "validateResponse": false},
      "rows": {
        "items": ".mod_book_list li",
        "fields": {
          "title": {"selector": ".mod_book_name a"},
          "link": {"selector": ".mod_book_name a", "attribute": "href"},
          "cover": {"selector": "img", "attribute": "data-original"}
        }
      }
    },
    "detail": {
      "handler": qqComicDetail,
      "fields": {
        "title": {"selector": ".works-intro-title"},
        "author": {"selector": ".works-intro-digi .first"},
        "summary": {"selector": ".works-intro-short"},
        "cover": {"selector": ".works-cover img", "attribute": "src"}
      },
      "chapters": {
        "items": ".chapter-page-all .works-chapter-item",
        "fields": {
          "title": {"selector": "a"},
          "link": {"selector": "a", "attribute": "href"},
          "free": {"selector": ".ui-icon-free", "attribute": "class"}
        }
      }
    },
    "reading": {
      "handler": qqComicContent
    }
  },
  "biquge": {
    "id": "biquge",
    "name": "笔趣阁",
    "kind": "novel",
    "group": "biquge",
    "homepage": "https://www.bqg.info/",
    "domains": ["bqg.info"],
    "capabilities": ["home", "detail", "content", "search", "catalog"],
    "parser": "biquge",
    "home": {
      "type": "html",
      "request": {"url": "{homepage}", "validateResponse": false},
      "sections": [
        {
          "id": "recommended",
          "title": "推荐阅读",
          "tabTitle": "推荐",
          "rows": ({...catalogTemplates.biqugeCards, items:'.body_46f > .section_46f:first-child .book-coverlist'})
        },
        {
          "id": "latest",
          "title": "最近更新",
          "tabTitle": "最新",
          "rows": {
            "items": ".body_46f .col-md-8 tbody > tr",
            "fields": {
              "title": {"selector": "td:nth-child(2) a", "attribute": "title"},
              "link": {"selector": "td:nth-child(2) a", "attribute": "href"},
              "author": {"selector": "td:nth-child(4)"},
              "summary": {"selector": "td:nth-child(3) a", "attribute": "title"}
            }
          }
        }
      ]
    },
    "catalog": {
      "filters": [
        {
          "id": "category",
          "title": "分类",
          "defaultValue": "all",
          "options": [
            {"value": "all", "title": "全部"},
            {"value": "xuanhuan", "title": "玄幻"},
            {"value": "xiuzhen", "title": "修真"},
            {"value": "dushi", "title": "都市"},
            {"value": "lishi", "title": "历史"},
            {"value": "wangyou", "title": "网游"},
            {"value": "kehuan", "title": "科幻"},
            {"value": "qita", "title": "其他"}
          ],
          "optionsSource": {
            "request": {"url": "{homepage}sort/"},
            "items": "a[href]",
            "fields": {
              "title": {"selector": ""},
              "href": {"selector": "", "attribute": "href"}
            },
            "valuePattern": /^\/sort\/([a-z]+)\/1\/$/,
            "titlePattern": /小说$/,
            "initialOptions": [
              {"value": "all", "title": "全部"}
            ],
            "minimumOptions": 2
          }
        },
        {
          "id": "status",
          "title": "状态",
          "defaultValue": "all",
          "options": [
            {"value": "all", "title": "不限"},
            {"value": "complete", "title": "完本"}
          ],
          "defaultSetting": "biqugeDefaultStatus"
        }
      ],
      "searchFilters": [],
      "library": {
        "request": [
          {
            "when": {"status": "complete", "category": "all"},
            "url": "{homepage}quanben/sort/1/"
          },
          {
            "when": {"status": "complete"},
            "url": "{homepage}quanben/sort/{category}/1/"
          },
          {
            "when": {"category": "all"},
            "url": "{homepage}sort/1/"
          },
          {"url": "{homepage}sort/{category}/1/"}
        ],
        "rows": {
          "items": "table tbody tr",
          "fields": {
            "title": {"selector": "td:nth-child(2) a", "attribute": "title"},
            "link": {"selector": "td:nth-child(2) a", "attribute": "href"},
            "author": {"selector": "td:nth-child(4)"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /\/(\d+)\/$/
        },
        "fallbackRows": catalogTemplates.biqugeCards
      },
      "search": {
        "request": {"url": "{homepage}search/?searchkey={query}", "validateResponse": false},
        "requireAny": ["book-coverlist", "有关的小说"],
        "rows": ({...catalogTemplates.biqugeCards, items:'.body-content .book-coverlist'}),
        "pagination": {"mode": "none"}
      }
    },
    "reading": {
      "chapterItems": "dl#newlist > dd",
      "chapterTitle": {"selector": "a"},
      "chapterLink": {"selector": "a", "attribute": "href"},
      "content": "#booktxt",
      "contentTitle": {"selector": "h1.readTitle"},
      "remove": ["script", "style", ".ad", ".ads"],
      "handler": biqugeContent,
      "next": "#linkNext",
      "chapterPattern": /^(https:\/\/www\.bqg\.info\/read\/\d+\/\d+)(?:_(\d+))?\.html$/,
      "ignoredParagraphs": [
        /^bqg\.info$/i,
        /^\[笔趣阁信息\][:：].*超级好记[！!]?$/,
        /^本章未完，请点击下一页继续阅读$/,
        /^[（(]本章完[）)]$/
      ],
      "continuationNotice": "本章未完，请点击下一页继续阅读"
    },
    "cards": catalogTemplates.biqugeCards,
    "detail": {
      "fields": {
        "title": {"selector": "h1.bookTitle"},
        "author": {"selector": "meta[property=\"og:novel:author\"]", "attribute": "content"},
        "summary": {"selector": "#bookIntro"},
        "cover": {"selector": "img.img-thumbnail", "attribute": "src"},
        "category": {"selector": "meta[property=\"og:novel:category\"]", "attribute": "content"},
        "status": {"selector": "meta[property=\"og:novel:status\"]", "attribute": "content"},
        "updated": {"selector": "meta[property=\"og:novel:update_time\"]", "attribute": "content"},
        "words": {"selector": ".booktag span.blue"}
      },
      "attributes": [
        {"name": "分类", "field": "category"},
        {"name": "状态", "field": "status"},
        {"name": "字数", "field": "words"},
        {"name": "更新时间", "field": "updated"}
      ]
    }
  },
  "gutenberg": {
    "id": "gutenberg",
    "name": "古登堡计划",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://www.gutenberg.org/ebooks/search/?sort_order=downloads",
    "domains": ["gutenberg.org"],
    "capabilities": ["home", "detail", "resources", "search", "catalog"],
    "parser": "html",
    "home": {
      "type": "html",
      "request": {"url": "{homepage}", "validateResponse": false},
      "sections": [
        {
          "id": "popular",
          "title": "热门作品",
          "tabTitle": "热门",
          "rows": {
            "items": "li.booklink",
            "fields": {
              "title": {"selector": ".title"},
              "link": {"selector": "a.link", "attribute": "href"},
              "cover": {"selector": "img.cover-thumb", "attribute": "src"},
              "author": {"selector": ".subtitle"}
            }
          }
        }
      ]
    },
    "catalog": {
      "filters": [
        {
          "id": "sort",
          "title": "排序",
          "defaultValue": "downloads",
          "options": [
            {"value": "downloads", "title": "下载量"},
            {"value": "release_date", "title": "最新"},
            {"value": "title", "title": "书名"}
          ]
        }
      ],
      "searchFilters": [
        {
          "id": "sort",
          "title": "排序",
          "defaultValue": "downloads",
          "options": [
            {"value": "downloads", "title": "下载量"},
            {"value": "release_date", "title": "最新"},
            {"value": "title", "title": "书名"}
          ]
        }
      ],
      "library": {
        "request": {"url": "https://www.gutenberg.org/ebooks/search/?sort_order={sort}"},
        "rows": catalogTemplates.gutenberg,
        "pagination": {"mode": "links"}
      },
      "search": {
        "request": {"url": "https://www.gutenberg.org/ebooks/search/?sort_order={sort}&query={query}"},
        "rows": catalogTemplates.gutenberg,
        "pagination": {"mode": "links"}
      }
    },
    "search": {
      "request": {"url": "https://www.gutenberg.org/ebooks/search/?query={query}&start_index={offset}", "validateResponse": false},
      "rows": catalogTemplates.gutenberg,
      "pageSize": 25
    },
    "detail": {
      "handler": gutenbergDetail,
      "resources": {
        "items": "a[type=\"application/epub+zip\"]",
        "fields": {
          "link": {"selector": "", "attribute": "href"}
        },
        "title": "EPUB",
        "filename": "book.epub"
      }
    }
  },
  "lingdian": {
    "id": "lingdian",
    "name": "零点小说",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://www.0xs.net/",
    "domains": ["0xs.net"],
    "capabilities": ["home", "search", "catalog"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "audience",
          "title": "读者",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "男频"},
            {"value": "1", "title": "女频"}
          ]
        },
        {
          "id": "category",
          "title": "分类",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "不限"},
            {
              "value": "1",
              "title": "玄幻",
              "when": {"audience": "0"}
            },
            {
              "value": "2",
              "title": "奇幻",
              "when": {"audience": "0"}
            },
            {
              "value": "3",
              "title": "武侠",
              "when": {"audience": "0"}
            },
            {
              "value": "4",
              "title": "仙侠",
              "when": {"audience": "0"}
            },
            {
              "value": "5",
              "title": "都市",
              "when": {"audience": "0"}
            },
            {
              "value": "6",
              "title": "现实",
              "when": {"audience": "0"}
            },
            {
              "value": "7",
              "title": "军事",
              "when": {"audience": "0"}
            },
            {
              "value": "8",
              "title": "历史",
              "when": {"audience": "0"}
            },
            {
              "value": "9",
              "title": "游戏",
              "when": {"audience": "0"}
            },
            {
              "value": "10",
              "title": "体育",
              "when": {"audience": "0"}
            },
            {
              "value": "11",
              "title": "科幻",
              "when": {"audience": "0"}
            },
            {
              "value": "12",
              "title": "悬疑",
              "when": {"audience": "0"}
            },
            {
              "value": "13",
              "title": "轻小说",
              "when": {"audience": "0"}
            },
            {
              "value": "14",
              "title": "短篇",
              "when": {"audience": "0"}
            },
            {
              "value": "15",
              "title": "古代言情",
              "when": {"audience": "1"}
            },
            {
              "value": "16",
              "title": "仙侠奇缘",
              "when": {"audience": "1"}
            },
            {
              "value": "17",
              "title": "现代言情",
              "when": {"audience": "1"}
            },
            {
              "value": "18",
              "title": "浪漫青春",
              "when": {"audience": "1"}
            },
            {
              "value": "19",
              "title": "玄幻言情",
              "when": {"audience": "1"}
            },
            {
              "value": "20",
              "title": "悬疑推理",
              "when": {"audience": "1"}
            },
            {
              "value": "21",
              "title": "科幻空间",
              "when": {"audience": "1"}
            },
            {
              "value": "22",
              "title": "游戏竞技",
              "when": {"audience": "1"}
            },
            {
              "value": "24",
              "title": "轻小说",
              "when": {"audience": "1"}
            },
            {
              "value": "25",
              "title": "短篇",
              "when": {"audience": "1"}
            }
          ]
        },
        {
          "id": "status",
          "title": "状态",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "不限"},
            {"value": "1", "title": "连载"},
            {"value": "2", "title": "完结"}
          ]
        },
        {
          "id": "words",
          "title": "字数",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "不限"},
            {"value": "1", "title": "30万以下"},
            {"value": "2", "title": "30–50万"},
            {"value": "3", "title": "50–100万"},
            {"value": "4", "title": "100–200万"},
            {"value": "5", "title": "200万以上"}
          ]
        },
        {
          "id": "sort",
          "title": "排序",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "默认"},
            {"value": "1", "title": "推荐"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": {"url": "{homepage}s/{audience}_{category}_{status}_{words}_{sort}_1.html"},
        "rows": {
          "items": ".main .list > ul > li, .result_list > ul > li",
          "fields": {
            "title": {"selector": ".book .name a"},
            "link": {"selector": ".book .name a", "attribute": "href"},
            "author": {"selector": ".book .author"},
            "cover": {"selector": ".image img", "attribute": "data-original"},
            "summary": {"selector": ".book .desc"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /_(\d+)\.html/
        }
      },
      "search": {
        "request": {"url": "{homepage}search.html?kw={query}"},
        "rows": {
          "items": ".main .list > ul > li, .result_list > ul > li",
          "fields": {
            "title": {"selector": ".book .name a"},
            "link": {"selector": ".book .name a", "attribute": "href"},
            "author": {"selector": ".book .author"},
            "cover": {"selector": ".image img", "attribute": "data-original"},
            "summary": {"selector": ".book .desc"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /[?&]p=(\d+)/
        }
      }
    }
  },
  "shuhaige": {
    "id": "shuhaige",
    "name": "书海阁",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://www.shuhaige.net/",
    "domains": ["shuhaige.net"],
    "capabilities": ["home", "search", "catalog", "detail", "chapters", "content"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "category",
          "title": "分类",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "全部"},
            {"value": "1", "title": "玄幻"},
            {"value": "2", "title": "奇幻"},
            {"value": "3", "title": "武侠"},
            {"value": "4", "title": "都市"},
            {"value": "5", "title": "历史"},
            {"value": "6", "title": "军事"},
            {"value": "7", "title": "悬疑"},
            {"value": "8", "title": "游戏"},
            {"value": "9", "title": "科幻"},
            {"value": "10", "title": "体育"},
            {"value": "11", "title": "古言"},
            {"value": "12", "title": "现言"},
            {"value": "13", "title": "幻言"},
            {"value": "14", "title": "仙侠"},
            {"value": "15", "title": "青春"},
            {"value": "16", "title": "穿越"},
            {"value": "17", "title": "女生"},
            {"value": "18", "title": "其他"}
          ]
        },
        {
          "id": "status",
          "title": "状态",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "不限"},
            {"value": "1", "title": "连载"},
            {"value": "2", "title": "完本"}
          ]
        },
        {
          "id": "sort",
          "title": "排序",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "默认"},
            {"value": "allvisit", "title": "总点击"},
            {"value": "monthvisit", "title": "月点击"},
            {"value": "weekvisit", "title": "周点击"},
            {"value": "dayvisit", "title": "日点击"},
            {"value": "allvote", "title": "总推荐"},
            {"value": "monthvote", "title": "月推荐"},
            {"value": "weekvote", "title": "周推荐"},
            {"value": "dayvote", "title": "日推荐"},
            {"value": "goodnum", "title": "收藏"},
            {"value": "size", "title": "字数"},
            {"value": "postdate", "title": "入库时间"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": {
          "url": "{homepage}shuku/{sort}_{category}_{status}_1.html",
          "headers": requestHeaders.shuhaige
        },
        "rows": {
          "items": ".sitebox dl, #sitembox dl",
          "fields": {
            "title": {"selector": "h3 a"},
            "link": {"selector": "h3 a", "attribute": "href"},
            "author": {"selector": ".book_other span:nth-of-type(1)"},
            "status": {"selector": ".book_other span:nth-of-type(2)"},
            "words": {"selector": ".book_other span:nth-of-type(4)"},
            "cover": {"selector": "dt img", "attribute": "src"},
            "summary": {"selector": ".book_des"}
          },
          "attributes": [{"name": "状态", "field": "status"}, {"name": "字数", "field": "words"}]
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /_(\d+)\.html/
        }
      },
      "search": {
        "request": {
          "url": "{homepage}search.html",
          "method": "POST",
          "form": {"searchkey": "{query}", "searchtype": "all"},
          "headers": requestHeaders.shuhaige
        },
        "rows": {
          "items": ".sitebox dl, #sitembox dl",
          "fields": {
            "title": {"selector": "h3 a"},
            "link": {"selector": "h3 a", "attribute": "href"},
            "author": {"selector": ".book_other span:nth-of-type(1)"},
            "status": {"selector": ".book_other span:nth-of-type(2)"},
            "words": {"selector": ".book_other span:nth-of-type(4)"},
            "cover": {"selector": "dt img", "attribute": "src"},
            "summary": {"selector": ".book_des"}
          },
          "attributes": [{"name": "状态", "field": "status"}, {"name": "字数", "field": "words"}]
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /\/(\d+)\.html$/
        },
        "preflight": {
          "url": "{homepage}",
          "headers": requestHeaders.shuhaige
        },
        "verificationPattern": /href=["\'][^"\']*from=ban1/
      }
    },
    "reading": {
      "engine": "paged",
      "toc": "#list dl dt:nth-of-type(2) ~ dd a[href]",
      "content": "#content",
      "next": "#pager_next",
      "headers": requestHeaders.iPhone
    }
  },
  "biquge365": {
    "id": "biquge365",
    "name": "笔趣阁365",
    "kind": "novel",
    "group": "biquge",
    "homepage": "https://www.biquge365.net/",
    "domains": ["biquge365.net"],
    "capabilities": ["home", "search", "catalog"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "list",
          "title": "书库",
          "defaultValue": "1",
          "options": [
            {"value": "1", "title": "玄幻魔法"},
            {"value": "2", "title": "仙侠修真"},
            {"value": "3", "title": "都市言情"},
            {"value": "4", "title": "网游动漫"},
            {"value": "5", "title": "科幻"},
            {"value": "6", "title": "恐怖灵异"},
            {"value": "7", "title": "历史军事"},
            {"value": "8", "title": "其他"},
            {"value": "full", "title": "完本"}
          ]
        }
      ],
      "searchFilters": [
        {
          "id": "field",
          "title": "范围",
          "defaultValue": "articlename",
          "options": [
            {"value": "articlename", "title": "书名"},
            {"value": "author", "title": "作者"}
          ]
        }
      ],
      "library": {
        "request": [
          {
            "when": {"list": "full"},
            "url": "{homepage}full/"
          },
          {"url": "{homepage}sort/{list}_1/"}
        ],
        "rows": {
          "items": ".menu li:has(span.name)",
          "fields": {
            "title": {"selector": "span.name a"},
            "fullTitle": {"selector": "span.name a", "attribute": "title"},
            "link": {"selector": "span.name a", "attribute": "href"},
            "author": {"selector": "span.zuo"}
          },
          "fullTitlePattern": /^《(.+)》文章列表$/
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /_(\d+)\/$/
        }
      },
      "search": {
        "request": {
          "url": "{homepage}s.php",
          "method": "POST",
          "form": {"type": "{field}", "s": "{query}"}
        },
        "rows": {
          "items": ".menu li:has(span.name)",
          "fields": {
            "title": {"selector": "span.name a"},
            "fullTitle": {"selector": "span.name a", "attribute": "title"},
            "link": {"selector": "span.name a", "attribute": "href"},
            "author": {"selector": "span.zuo"}
          },
          "fullTitlePattern": /^《(.+)》文章列表$/
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /_(\d+)\/$/
        }
      }
    }
  },
  "d8": {
    "id": "d8",
    "name": "第八中文网",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://www.d8zw.com/",
    "domains": ["d8zw.com"],
    "capabilities": ["home", "search", "catalog"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "list",
          "title": "书库",
          "defaultValue": "1",
          "options": [
            {"value": "1", "title": "玄幻"},
            {"value": "2", "title": "武侠"},
            {"value": "3", "title": "都市"},
            {"value": "4", "title": "历史"},
            {"value": "5", "title": "网游"},
            {"value": "6", "title": "科幻"},
            {"value": "7", "title": "言情"},
            {"value": "8", "title": "其他"},
            {"value": "full", "title": "完本"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": [
          {
            "when": {"list": "full"},
            "url": "{homepage}full/"
          },
          {"url": "{homepage}list{list}/"}
        ],
        "rows": catalogTemplates.coverCards,
        "pagination": {
          "mode": "links",
          "pagePattern": /\/(\d+)\.html/
        }
      },
      "search": {
        "request": {"url": "{homepage}search.php?q={query}"},
        "rows": catalogTemplates.coverCards,
        "pagination": {
          "mode": "links",
          "pagePattern": /[?&]p=(\d+)/
        }
      }
    }
  },
  "kks101": {
    "id": "kks101",
    "name": "101看书",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://101kks.com/",
    "domains": ["101kks.com"],
    "capabilities": ["home", "search", "catalog"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "list",
          "title": "书库",
          "defaultValue": "class",
          "options": [
            {"value": "class", "title": "分类"},
            {"value": "hot", "title": "站点榜单"},
            {"value": "full", "title": "完本"},
            {"value": "last", "title": "最新"}
          ]
        },
        {
          "id": "category",
          "title": "分类",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "全部"},
            {
              "value": "1",
              "title": "玄幻奇幻",
              "when": {"list": "class"}
            },
            {
              "value": "2",
              "title": "武侠仙侠",
              "when": {"list": "class"}
            },
            {
              "value": "3",
              "title": "现代都市",
              "when": {"list": "class"}
            },
            {
              "value": "4",
              "title": "历史军事",
              "when": {"list": "class"}
            },
            {
              "value": "5",
              "title": "科幻",
              "when": {"list": "class"}
            },
            {
              "value": "6",
              "title": "游戏竞技",
              "when": {"list": "class"}
            },
            {
              "value": "7",
              "title": "恐怖灵异",
              "when": {"list": "class"}
            },
            {
              "value": "8",
              "title": "言情",
              "when": {"list": "class"}
            },
            {
              "value": "9",
              "title": "动漫同人",
              "when": {"list": "class"}
            },
            {
              "value": "10",
              "title": "其他",
              "when": {"list": "class"}
            }
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": [
          {
            "when": {"list": "class"},
            "url": "{homepage}novels/class/{category}_1.html"
          },
          {
            "when": {"list": "last"},
            "url": "{homepage}last"
          },
          {"url": "{homepage}novels/{list}"}
        ],
        "rows": {
          "items": "#article_list_content > li",
          "fields": {
            "title": {"selector": ".newnav h3 a:last-child"},
            "link": {"selector": ".newnav h3 a:last-child", "attribute": "href"},
            "author": {"selector": ".labelbox label:first-child"},
            "cover": {"selector": "img", "attribute": "data-src"},
            "summary": {"selector": ".ellipsis_2"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /[_\/](\d+)\.html/
        }
      },
      "search": {
        "request": {"url": "{homepage}search/{query}/1.html"},
        "rows": {
          "items": "#article_list_content > li",
          "fields": {
            "title": {"selector": ".newnav h3 a:last-child"},
            "link": {"selector": ".newnav h3 a:last-child", "attribute": "href"},
            "author": {"selector": ".labelbox label:first-child"},
            "cover": {"selector": "img", "attribute": "data-src"},
            "summary": {"selector": ".ellipsis_2"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /[_\/](\d+)\.html/
        }
      }
    }
  },
  "sudugu": {
    "id": "sudugu",
    "name": "速读谷",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://www.suduguu.com/",
    "domains": ["suduguu.com"],
    "capabilities": ["home", "search", "catalog"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "category",
          "title": "分类",
          "defaultValue": "all",
          "options": [
            {"value": "all", "title": "全部"},
            {"value": "xuanhuan", "title": "玄幻"},
            {"value": "xianxia", "title": "仙侠"},
            {"value": "dushi", "title": "都市"},
            {"value": "lishi", "title": "历史"},
            {"value": "junshi", "title": "军事"},
            {"value": "kehuan", "title": "科幻"},
            {"value": "yanqing", "title": "言情"},
            {"value": "qing", "title": "轻小说"},
            {"value": "zhutianwuxian", "title": "诸天无限"},
            {"value": "qihuan", "title": "奇幻"},
            {"value": "youxi", "title": "游戏"},
            {"value": "xuanyi", "title": "悬疑"},
            {"value": "tiyu", "title": "体育"},
            {"value": "wuxia", "title": "武侠"},
            {"value": "guanchang", "title": "官场"},
            {"value": "xiangcun", "title": "乡村"},
            {"value": "xianshi", "title": "现实"}
          ]
        },
        {
          "id": "status",
          "title": "状态",
          "defaultValue": "all",
          "options": [
            {"value": "all", "title": "不限"},
            {"value": "complete", "title": "完本"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": [
          {
            "when": {"status": "complete", "category": "all"},
            "url": "{homepage}wanjie/"
          },
          {
            "when": {"status": "complete"},
            "url": "{homepage}wanjie/{category}.html"
          },
          {
            "when": {"category": "all"},
            "url": "{homepage}zuixin/"
          },
          {"url": "{homepage}{category}/"}
        ],
        "rows": {
          "items": ".container .item",
          "fields": {
            "title": {"selector": "h3 a"},
            "link": {"selector": "h3 a", "attribute": "href"},
            "author": {"selector": ".itemtxt p:nth-of-type(2)"},
            "cover": {"selector": "img", "attribute": "src"},
            "summary": {"selector": ".itemtxt p:first-of-type"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /\/(\d+)\.html/
        }
      },
      "search": {
        "request": {"url": "{homepage}i/sor.aspx?key={query}"},
        "rows": {
          "items": ".container .item",
          "fields": {
            "title": {"selector": "h3 a"},
            "link": {"selector": "h3 a", "attribute": "href"},
            "author": {"selector": ".itemtxt p:nth-of-type(2)"},
            "cover": {"selector": "img", "attribute": "src"},
            "summary": {"selector": ".itemtxt p:first-of-type"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /[?&]p=(\d+)/
        }
      }
    }
  },
  "xbiquge": {
    "id": "xbiquge",
    "name": "新笔趣阁小说网",
    "kind": "novel",
    "group": "biquge",
    "homepage": "https://www.xbiquge.info/",
    "domains": ["xbiquge.info"],
    "capabilities": ["home", "search", "catalog", "detail", "chapters", "content"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "list",
          "title": "书库",
          "defaultValue": "1",
          "options": [
            {"value": "1", "title": "玄幻"},
            {"value": "2", "title": "武侠"},
            {"value": "3", "title": "都市"},
            {"value": "4", "title": "历史"},
            {"value": "5", "title": "网游"},
            {"value": "6", "title": "科幻"},
            {"value": "7", "title": "言情"},
            {"value": "8", "title": "其他"},
            {"value": "full", "title": "完本"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": [
          {
            "when": {"list": "full"},
            "url": "{homepage}full/",
            "headers": requestHeaders.iPhone
          },
          {
            "url": "{homepage}list{list}/",
            "headers": requestHeaders.iPhone
          }
        ],
        "rows": catalogTemplates.coverCards,
        "pagination": {
          "mode": "links",
          "pagePattern": /\/(\d+)\.html/
        }
      },
      "search": {
        "request": {
          "url": "{homepage}search.php?q={query}",
          "headers": requestHeaders.iPhone
        },
        "rows": catalogTemplates.coverCards,
        "pagination": {
          "mode": "links",
          "pagePattern": /[?&]p=(\d+)/
        }
      }
    },
    "reading": {
      "engine": "paged",
      "toc": ".book_list2 a[href]",
      "content": ".box.single article",
      "next": "#next1",
      "tocPaging": "links",
      "headers": requestHeaders.iPhone
    }
  },
  "biquwu": {
    "id": "biquwu",
    "name": "笔趣屋",
    "kind": "novel",
    "group": "biquge",
    "homepage": "https://www.fsshu.com/",
    "domains": ["fsshu.com"],
    "capabilities": ["home", "search", "catalog", "detail", "chapters", "content"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "list",
          "title": "书库",
          "defaultValue": "1",
          "options": [
            {"value": "1", "title": "玄幻"},
            {"value": "2", "title": "武侠"},
            {"value": "3", "title": "都市"},
            {"value": "4", "title": "历史"},
            {"value": "5", "title": "网游"},
            {"value": "6", "title": "科幻"},
            {"value": "7", "title": "言情"},
            {"value": "8", "title": "其他"},
            {"value": "full", "title": "完本"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": [
          {
            "when": {"list": "full"},
            "url": "{homepage}full/",
            "headers": requestHeaders.iPhone
          },
          {
            "url": "{homepage}list{list}/",
            "headers": requestHeaders.iPhone
          }
        ],
        "rows": catalogTemplates.coverCards,
        "pagination": {
          "mode": "links",
          "pagePattern": /\/(\d+)\.html/
        }
      },
      "search": {
        "request": {
          "url": "{homepage}search.php?q={query}",
          "headers": requestHeaders.iPhone
        },
        "rows": catalogTemplates.coverCards,
        "pagination": {
          "mode": "links",
          "pagePattern": /[?&]p=(\d+)/
        }
      }
    },
    "reading": {
      "engine": "paged",
      "toc": ".book_list2 a[href]",
      "content": ".box.single article",
      "next": "#next1",
      "tocPaging": "links",
      "chapterPattern": /^(https:\/\/[^?#]+\/c\d+)(?:_(\d+))?\.html$/,
      "headers": requestHeaders.iPhone
    }
  },
  "shaonian": {
    "id": "shaonian",
    "name": "少年小说网",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://www.snxsw.com/",
    "domains": ["snxsw.com"],
    "capabilities": ["home", "search", "catalog", "detail", "chapters", "content"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "category",
          "title": "分类",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "全部"},
            {"value": "1", "title": "玄幻修真"},
            {"value": "2", "title": "重生穿越"},
            {"value": "3", "title": "都市小说"},
            {"value": "4", "title": "军史小说"},
            {"value": "5", "title": "网游小说"},
            {"value": "6", "title": "科幻小说"},
            {"value": "7", "title": "灵异小说"},
            {"value": "8", "title": "言情小说"},
            {"value": "9", "title": "其他小说"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": {
          "url": "{homepage}fl/{category}/1/",
          "headers": requestHeaders.iPhone
        },
        "rows": {
          "items": ".sort_list > li",
          "fields": {
            "title": {"selector": ".s2 a"},
            "link": {"selector": ".s2 a", "attribute": "href"},
            "author": {"selector": ".s4"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /\/(\d+)\/$/
        }
      },
      "search": {
        "request": {
          "url": "{homepage}search.html",
          "method": "POST",
          "form": {"s": "{query}"},
          "headers": requestHeaders.iPhone
        },
        "rows": {
          "items": ".sort_list > li",
          "fields": {
            "title": {"selector": ".s2 a"},
            "link": {"selector": ".s2 a", "attribute": "href"},
            "author": {"selector": ".s5"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /\/(\d+)\/$/
        }
      }
    },
    "reading": {
      "engine": "paged",
      "toc": ".chapter-list a[href]",
      "detailToc": "h3.wrap-title:contains(章节列表) + .block-box .chapter-list a[href]",
      "content": "#txt",
      "directoryLink": ".book-detail-btn a[href*=\"/index/\"]",
      "tocPaging": "select",
      "encoded": true,
      "nextVariable": true,
      "headers": requestHeaders.iPhone
    }
  },
  "dingdian": {
    "id": "dingdian",
    "name": "顶点小说",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://www.wxsy.net/",
    "domains": ["wxsy.net"],
    "capabilities": ["home", "catalog", "detail", "chapters", "content"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "category",
          "title": "分类",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "全部"},
            {"value": "1", "title": "玄幻修真"},
            {"value": "2", "title": "重生穿越"},
            {"value": "3", "title": "都市小说"},
            {"value": "4", "title": "军史小说"},
            {"value": "5", "title": "网游小说"},
            {"value": "6", "title": "科幻小说"},
            {"value": "7", "title": "灵异小说"},
            {"value": "8", "title": "言情小说"},
            {"value": "9", "title": "其他小说"}
          ]
        },
        {
          "id": "sort",
          "title": "排序",
          "defaultValue": "lastupdate",
          "options": [
            {"value": "lastupdate", "title": "最新更新"},
            {"value": "dayvisit", "title": "日点击"},
            {"value": "weekvisit", "title": "周点击"},
            {"value": "monthvisit", "title": "月点击"},
            {"value": "allvisit", "title": "总点击"},
            {"value": "dayvote", "title": "日推荐"},
            {"value": "weekvote", "title": "周推荐"},
            {"value": "monthvote", "title": "月推荐"},
            {"value": "allvote", "title": "总推荐"},
            {"value": "goodnum", "title": "收藏"},
            {"value": "size", "title": "字数"},
            {"value": "postdate", "title": "最新入库"}
          ]
        },
        {
          "id": "words",
          "title": "字数",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "不限"},
            {"value": "1", "title": "30万以下"},
            {"value": "2", "title": "30–50万"},
            {"value": "3", "title": "50–100万"},
            {"value": "4", "title": "100–200万"},
            {"value": "5", "title": "200万以上"}
          ]
        },
        {
          "id": "status",
          "title": "状态",
          "defaultValue": "0",
          "options": [
            {"value": "0", "title": "不限"},
            {"value": "1", "title": "连载"},
            {"value": "2", "title": "完结"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": {
          "url": "{homepage}sort/{sort}_{category}_{words}_{status}_1.html",
          "headers": requestHeaders.iPhone
        },
        "rows": {
          "items": ".sort_list > li",
          "fields": {
            "title": {"selector": ".s2 a"},
            "link": {"selector": ".s2 a", "attribute": "href"},
            "author": {"selector": ".s4"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /_(\d+)\.html/
        }
      },
      "search": null
    },
    "reading": {
      "engine": "paged",
      "toc": ".chapter-list a[href]",
      "detailToc": "h3.wrap-title:contains(章节列表) + .block-box .chapter-list a[href]",
      "content": "#txt",
      "directoryLink": ".book-detail-btn a[href*=\"/chapter_\"]",
      "tocPaging": "select",
      "encoded": true,
      "nextVariable": true,
      "chapterPattern": /^(https:\/\/[^?#]+\/read_\d+)(?:_(\d+))?\.html$/,
      "headers": requestHeaders.iPhone
    }
  },
  "quanben": {
    "id": "quanben",
    "name": "全本小说网",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://quanben5.com/",
    "domains": ["quanben5.com"],
    "capabilities": ["home", "search", "catalog", "detail", "chapters", "content"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "category",
          "title": "分类",
          "defaultValue": "1",
          "options": [
            {"value": "1", "title": "玄幻"},
            {"value": "2", "title": "都市"},
            {"value": "3", "title": "仙侠"},
            {"value": "4", "title": "武侠"},
            {"value": "5", "title": "言情"},
            {"value": "6", "title": "穿越"},
            {"value": "7", "title": "网游"},
            {"value": "8", "title": "奇幻"},
            {"value": "9", "title": "科幻"},
            {"value": "10", "title": "悬疑"},
            {"value": "11", "title": "青春"},
            {"value": "12", "title": "校园"},
            {"value": "13", "title": "军事"},
            {"value": "14", "title": "历史"},
            {"value": "15", "title": "同人"},
            {"value": "18", "title": "其他"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": {
          "url": "{homepage}category/{category}.html",
          "headers": requestHeaders.quanben
        },
        "rows": {
          "items": ".pic_txt_list",
          "fields": {
            "title": {"selector": "h3 a"},
            "link": {"selector": "h3 a", "attribute": "href"},
            "author": {"selector": ".author"},
            "status": {"selector": ".info"},
            "cover": {"selector": ".pic img", "attribute": "src"},
            "summary": {"selector": ".description"}
          },
          "attributes": [{"name": "状态", "field": "status", "pattern": /[（(](完结|连载中|连载)[）)]/}]
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /_(\d+)\.html/
        }
      },
      "search": {
        "request": {
          "url": "{homepage}?c=book&a=search.json&callback=search&keywords={query}&b={encodedQuery}",
          "headers": ({...requestHeaders.quanben, Referer:'https://quanben5.com/'})
        },
        "queryEncoding": {"alphabet": "PXhw7UT1B0a9kQDKZsjIASmOezxYG4CHo5Jyfg2b8FLpEvRr3WtVnlqMidu6cN", "shift": 3},
        "response": {
          "type": "jsonp",
          "callback": "search",
          "statusField": "id",
          "successValue": 0,
          "htmlField": "content"
        },
        "rows": {
          "items": ".pic_txt_list",
          "fields": {
            "title": {"selector": "h3 a"},
            "link": {"selector": "h3 a", "attribute": "href"},
            "author": {"selector": ".author"},
            "status": {"selector": ".info"},
            "cover": {"selector": ".pic img", "attribute": "src"},
            "summary": {"selector": ".description"}
          },
          "attributes": [{"name": "状态", "field": "status", "pattern": /[（(](完结|连载中|连载)[）)]/}]
        },
        "pagination": {"mode": "none"}
      }
    },
    "reading": {
      "engine": "paged",
      "toc": ".list li a[href]",
      "content": "#content",
      "next": "#page_next a",
      "directoryLink": "a[href$=\"/xiaoshuo.html\"]",
      "separateDirectory": true,
      "headers": requestHeaders.quanben
    }
  },
  "xtianxi": {
    "id": "xtianxi",
    "name": "新天禧小说",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://www.xtxxs9.com/",
    "domains": ["xtxxs9.com"],
    "capabilities": ["home", "catalog", "detail", "chapters", "content"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "category",
          "title": "分类",
          "defaultValue": "1",
          "options": [
            {"value": "1", "title": "玄幻·男频"},
            {"value": "2", "title": "奇幻"},
            {"value": "3", "title": "武侠"},
            {"value": "4", "title": "仙侠·男频"},
            {"value": "5", "title": "都市"},
            {"value": "6", "title": "历史"},
            {"value": "7", "title": "军事"},
            {"value": "8", "title": "游戏·男频"},
            {"value": "9", "title": "体育"},
            {"value": "10", "title": "科幻·男频"},
            {"value": "11", "title": "灵异"},
            {"value": "12", "title": "古代言情"},
            {"value": "13", "title": "现代言情"},
            {"value": "14", "title": "玄幻·女频"},
            {"value": "15", "title": "仙侠·女频"},
            {"value": "16", "title": "浪漫"},
            {"value": "17", "title": "游戏·女频"},
            {"value": "18", "title": "科幻·女频"},
            {"value": "19", "title": "悬疑"},
            {"value": "20", "title": "二次元"},
            {"value": "21", "title": "其他"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": {
          "url": "{homepage}fenlei/{category}/1/",
          "headers": requestHeaders.iPhone
        },
        "rows": {
          "items": ".l .item",
          "fields": {
            "title": {"selector": "dt a"},
            "link": {"selector": "dt a", "attribute": "href"},
            "author": {"selector": ".btm a"},
            "summary": {"selector": "dd"},
            "cover": {"selector": ".image img", "attribute": "src"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /\/(\d+)\/$/
        }
      },
      "search": null
    },
    "reading": {
      "engine": "paged",
      "toc": "#list a[rel=\"chapter\"]",
      "content": "#booktxt",
      "next": "#next_url",
      "directoryLink": "a[href^=\"/xiaoshuo/\"][href$=\"/\"]",
      "separateDirectory": true,
      "tocPaging": "select",
      "headers": requestHeaders.iPhone
    }
  },
  "xiaoshuohu": {
    "id": "xiaoshuohu",
    "name": "小说虎",
    "kind": "novel",
    "group": "novel",
    "homepage": "https://www.xiaoshuohu.com/",
    "domains": ["xiaoshuohu.com"],
    "capabilities": ["home", "catalog", "detail", "chapters", "content"],
    "parser": "html",
    "home": {"type": "catalog", "id": "library", "title": "小说书库", "tabTitle": "书库"},
    "catalog": {
      "filters": [
        {
          "id": "list",
          "title": "书库",
          "defaultValue": "1",
          "options": [
            {"value": "1", "title": "玄幻"},
            {"value": "2", "title": "奇幻"},
            {"value": "3", "title": "武侠"},
            {"value": "4", "title": "仙侠"},
            {"value": "5", "title": "都市"},
            {"value": "6", "title": "军事"},
            {"value": "7", "title": "历史"},
            {"value": "8", "title": "游戏"},
            {"value": "9", "title": "竞技"},
            {"value": "10", "title": "科幻"},
            {"value": "11", "title": "悬疑"},
            {"value": "12", "title": "灵异"},
            {"value": "13", "title": "其他"},
            {"value": "14", "title": "古代言情"},
            {"value": "15", "title": "仙侠奇缘"},
            {"value": "16", "title": "现代言情"},
            {"value": "17", "title": "浪漫青春"},
            {"value": "18", "title": "玄幻言情"},
            {"value": "19", "title": "悬疑灵异"},
            {"value": "20", "title": "科幻空间"},
            {"value": "21", "title": "游戏竞技"},
            {"value": "22", "title": "BL文"},
            {"value": "23", "title": "GL文"},
            {"value": "24", "title": "二次元"},
            {"value": "full", "title": "完结书库"}
          ]
        }
      ],
      "searchFilters": [],
      "library": {
        "request": [
          {
            "when": {"list": "full"},
            "url": "{homepage}quanben/fenlei/",
            "headers": requestHeaders.iPhone
          },
          {
            "url": "{homepage}fenlei/{list}/1/",
            "headers": requestHeaders.iPhone
          }
        ],
        "rows": {
          "items": "#newscontent .l li",
          "fields": {
            "title": {"selector": ".s2 a"},
            "link": {"selector": ".s2 a", "attribute": "href"},
            "author": {"selector": ".s4"}
          }
        },
        "pagination": {
          "mode": "links",
          "pagePattern": /\/(\d+)\/$/
        }
      },
      "search": null
    },
    "reading": {
      "engine": "paged",
      "toc": "#list dd a[href]",
      "content": "#content",
      "next": ".bottem2 a[href]",
      "headers": requestHeaders.iPhone
    }
  }
};

const driveRules = {
  "webdav": {
    "id": "webdav",
    "name": "WebDAV",
    "root": "",
    "authentication": {"kind": "webDAV", "domains": []}
  },
  "quark": {
    "id": "quark",
    "name": "夸克网盘",
    "root": "0",
    "authentication": {
      "kind": "cookie",
      "loginURL": "https://pan.quark.cn/",
      "loginSelector": "[class*='LoginComponent--modal--']",
      "domains": ["quark.cn"]
    },
    "apiBase": "https://drive-pc.quark.cn/1/clouddrive",
    "parameters": {"pr": "ucpro", "fr": "pc", "uc_param_str": ""},
    "headers": {"Referer": "https://pan.quark.cn/", "Origin": "https://pan.quark.cn"},
    "routes": {
      "list": "/file/sort",
      "download": "/file/download",
      "shareToken": "/share/sharepage/token",
      "shareDetail": "/share/sharepage/detail",
      "pathInfo": "/file/info/path_list",
      "create": "/file",
      "save": "/share/sharepage/save",
      "task": "/task"
    }
  },
  "baidu": {
    "id": "baidu",
    "name": "百度网盘",
    "root": "/",
    "authentication": {
      "kind": "cookie",
      "loginURL": "https://pan.baidu.com/disk/main",
      "domains": ["baidu.com"]
    },
    "webBase": "https://pan.baidu.com",
    "appID": 250528,
    "headers": {"Referer": "https://pan.baidu.com/disk/main"},
    "shareHeaders": {"Referer": "https://pan.baidu.com/", "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest"},
    "downloadHeaders": {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15", "Referer": "https://pan.baidu.com/"},
    "routes": {
      "list": "/api/list",
      "variables": "/api/gettemplatevariable",
      "download": "/api/download",
      "verify": "/share/verify",
      "shareList": "/share/list",
      "create": "/api/create",
      "transfer": "/share/transfer"
    }
  }
};

const sourceSettings = [
  {
    "id": "biqugeDefaultStatus",
    "title": "笔趣阁默认书库",
    "type": "select",
    "defaultValue": "all",
    "options": [
      {"value": "all", "title": "全部"},
      {"value": "complete", "title": "完本"}
    ]
  }
];

const sourceDefinitions = {
  "official": {
    "apiVersion": 2,
    "id": "nori.collection",
    "name": "随阅书源合集",
    "version": "1.9.0",
    "siteIDs": ["kgbook", "biquge", "gutenberg", "shuhaige", "xbiquge", "biquwu", "shaonian", "dingdian", "quanben", "xtianxi", "xiaoshuohu"],
    "driveIDs": ["quark", "baidu", "webdav"],
    "settings": sourceSettings
  },
  "novels": {
    "apiVersion": 2,
    "id": "nori.novels",
    "name": "随阅小说站",
    "version": "1.3.1",
    "siteIDs": ["biquge", "lingdian", "shuhaige", "biquge365", "d8", "kks101", "sudugu"],
    "aliases": {"biquge": "biquge-info", "shuhaige": "shuhaige-extra"},
    "driveIDs": [],
    "settings": sourceSettings
  },
  "websites": {
    "apiVersion": 2,
    "id": "nori.websites",
    "name": "随阅网站源",
    "version": "1.5.0",
    "siteIDs": ["kgbook", "fanqie", "sfnovel", "mox", "kuaikan", "qqcomics", "biquge", "gutenberg", "lingdian", "shuhaige", "biquge365", "d8", "kks101", "sudugu", "xbiquge", "biquwu", "shaonian", "dingdian", "quanben", "xtianxi", "xiaoshuohu"],
    "driveIDs": [],
    "settings": sourceSettings
  },
  "drives": {
    "apiVersion": 1,
    "id": "nori.drives",
    "name": "随阅网盘",
    "version": "1.2.0",
    "siteIDs": [],
    "driveIDs": ["quark", "baidu", "webdav"],
    "settings": []
  }
};

var source = createSource(sourceDefinitions.websites);
