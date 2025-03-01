import Image from "next/image";
import styles from "./bookmarks.module.css";
import { useEffect, useState } from "react";

interface Bookmark {
    name: string;
    url: string;
    img: string;
    status?: string;
}

interface Section {
    name: string;
    img: string;
    bookmark: Bookmark[];
}

interface BookmarksState {
    sections: Section[];
}

export function Bookmarks({ searchText, setSelectedBookmark }: { searchText: string, setSelectedBookmark: (bookmark: any) => void }) {
    const data = {
        sections: [
            {
                "name": "Manage",
                "img": "/assets/home/img/manage.png",
                "bookmark": [
                    {
                        "name": "Google Drive",
                        "url": "https://drive.google.com/drive/u/0/my-drive",
                        "img": "/assets/home/img/drive.png",
                        "status": ""
                    },
                    {
                        "name": "iCloud",
                        "url": "https://www.icloud.com",
                        "img": "/assets/home/img/icloud.png"
                    },
                    {
                        "name": "Alliant",
                        "url": "https://www.alliantcreditunion.com/onlinebanking/dashboard/S40",
                        "img": "/assets/home/img/alliant.png"
                    },
                    {
                        "name": "Vanguard",
                        "url": "https://dashboard.web.vanguard.com",
                        "img": "/assets/home/img/vanguard.png"
                    },
                    {
                        "name": "Capital One",
                        "url": "https://myaccounts.capitalone.com/Card/vbxxrUEXWa7l3Q1Tmm51136bgqeZh%252FSp0tgqjaCYpOY=",
                        "img": "/assets/home/img/capitalone.png"
                    }
                ]
            },
            {
                "name": "Work",
                "img": "/assets/home/img/work.png",
                "bookmark": [
                    {
                        "name": "ADP Schedule",
                        "url": "https://workforcenow.adp.com/theme/index.html#/Myself/MyselfTabTimecardsAttendanceSchCategoryMonthlySchedule",
                        "img": "/assets/home/img/adp.png"
                    },
                    {
                        "name": "LinkedIn",
                        "url": "https://www.linkedin.com/feed/",
                        "img": "/assets/home/img/linkedin.png"
                    },
                    {
                        "name": "Glassdoor",
                        "url": "https://www.glassdoor.com/Reviews/index.htm",
                        "img": "/assets/home/img/glassdoor.png"
                    },
                    {
                        "name": "Harvestworks Dev",
                        "url": "http://137.184.72.135/wp-admin/",
                        "img": "/assets/home/img/harvestworks.png"
                    }
                ]
            },
            {
                "name": "Social",
                "img": "/assets/home/img/social.png",
                "bookmark": [
                    {
                        "name": "NYT New York Times News",
                        "url": "https://www.nytimes.com",
                        "img": "/assets/home/img/nyt.png"
                    },
                    {
                        "name": "Artcards exhibitions",
                        "url": "http://artcards.cc",
                        "img": "/assets/home/img/artcards.png"
                    },
                    {
                        "name": "Timesout timeout",
                        "url": "https://www.timeout.com/newyork",
                        "img": "/assets/home/img/timeout.png"
                    }
                ]
            },
            {
                "name": "Write",
                "img": "/assets/home/img/write.png",
                "bookmark": [
                    {
                        "name": "Onelook thesaurus",
                        "url": "https://www.onelook.com/reverse-dictionary.shtml?",
                        "img": "/assets/home/img/onelook.png"
                    },
                    {
                        "name": "ChatGPT",
                        "url": "https://chatgpt.com",
                        "img": "/assets/home/img/chatgpt.png"
                    },
                    {
                        "name": "NotebookLM",
                        "url": "https://notebooklm.google.com/",
                        "img": "/assets/home/img/notebooklm.png"
                    },
                    {
                        "name": "Rhymezone",
                        "url": "https://www.rhymezone.com",
                        "img": "/assets/home/img/rhymezone.png"
                    },
                    {
                        "name": "Spruce quotes proverbs",
                        "url": "https://www.onelook.com/spruce/",
                        "img": "/assets/home/img/spruce.png"
                    }
                ]
            },
            {
                "name": "Read",
                "img": "/assets/home/img/read.png",
                "bookmark": [
                    {
                        "name": "Wikipedia",
                        "url": "https://en.wikipedia.org/wiki/Main_Page",
                        "img": "/assets/home/img/wikipedia.png"
                    },
                    {
                        "name": "Random Wiki Article",
                        "url": "https://en.wikipedia.org/wiki/Special:Random",
                        "img": "/assets/home/img/random.png"
                    },
                    {
                        "name": "Libgen books",
                        "url": "https://libgen.is",
                        "img": "/assets/home/img/libgen.png"
                    },
                    {
                        "name": "Philosophy plato stanford",
                        "url": "https://plato.stanford.edu/index.html",
                        "img": "/assets/home/img/plato.png"
                    },
                    {
                        "name": "Audible",
                        "url": "https://www.audible.com/library/titles",
                        "img": "/assets/home/img/audible.png"
                    }
                ]
            },
            {
                "name": "Projects",
                "img": "/assets/home/img/projects.png",
                "bookmark": [
                    {
                        "name": "Localhost",
                        "url": "http://localhost:3000",
                        "img": "/assets/home/img/localhost.png"
                    },
                    {
                        "name": "Portfolio",
                        "url": "https://alexya.ng",
                        "img": "/assets/home/img/portfolio.png"
                    },
                    {
                        "name": "Active Listener",
                        "url": "https://activelistener.alexya.ng",
                        "img": "/assets/home/img/activelistener.png"
                    },
                    {
                        "name": "Accountable Brands",
                        "url": "https://accountablebrand.org",
                        "img": "/assets/home/img/collabaccountablebrands.png"
                    },
                    {
                        "name": "Accountable Brands Collaborative",
                        "url": "https://collab.accountablebrand.org",
                        "img": "/assets/home/img/accountablebrands.png"
                    }
                ]
            },
            {
                "name": "Code",
                "img": "/assets/home/img/code.png",
                "bookmark": [
                    {
                        "name": "Github",
                        "url": "https://github.com/alextyang?tab=repositories",
                        "img": "/assets/home/img/github.png"
                    },
                    {
                        "name": "Cloudflare",
                        "url": "https://dash.cloudflare.com",
                        "img": "/assets/home/img/cloudflare.png"
                    },
                    {
                        "name": "Google cloud",
                        "url": "https://console.cloud.google.com",
                        "img": "/assets/home/img/googlecloud.png"
                    },
                    {
                        "name": "Vercel",
                        "url": "https://vercel.com/dashboard",
                        "img": "/assets/home/img/vercel.png"
                    },
                    {
                        "name": "Digital Ocean",
                        "url": "https://cloud.digitalocean.com",
                        "img": "/assets/home/img/digitalocean.png"
                    },
                    {
                        "name": "Search Console",
                        "url": "https://search.google.com/search-console",
                        "img": "/assets/home/img/searchconsole.png"
                    },
                    {
                        "name": "Google analytics",
                        "url": "https://analytics.google.com/analytics/web/",
                        "img": "/assets/home/img/googleanalytics.png"
                    },
                    {
                        "name": "Text Mechanic",
                        "url": "https://textmechanic.com",
                        "img": "/assets/home/img/textmechanic.png"
                    },
                    {
                        "name": "Web Flowchart",
                        "url": "https://andreasbm.github.io/web-skills/?compact",
                        "img": "/assets/home/img/webtree.png"
                    },
                    {
                        "name": "MDN docs",
                        "url": "https://developer.mozilla.org/en-US/",
                        "img": "/assets/home/img/mdn.png"
                    },
                    {
                        "name": "CSS Guide",
                        "url": "https://css-tricks.com/snippets/css/",
                        "img": "/assets/home/img/css.png"
                    }
                ]
            },
            {
                "name": "Design",
                "img": "/assets/home/img/design.png",
                "bookmark": [
                    {
                        "name": "Material Icons",
                        "url": "https://fonts.google.com/icons",
                        "img": "/assets/home/img/material.png"
                    },
                    {
                        "name": "Adobe Fonts",
                        "url": "https://fonts.adobe.com/fonts",
                        "img": "/assets/home/img/adobefonts.png"
                    },
                    {
                        "name": "Adobe Font Type Ripper",
                        "url": "http://badnoise.net/TypeRip/",
                        "img": "/assets/home/img/typerip.png"
                    },
                    {
                        "name": "fontbrief fontsearch",
                        "url": "https://www.fontbrief.com/fontbrief",
                        "img": "/assets/home/img/fontbrief.png"
                    },
                    {
                        "name": "Coolors Color Palette",
                        "url": "https://coolors.co/generate",
                        "img": "/assets/home/img/coolors.png"
                    },
                    {
                        "name": "Supershapes generator",
                        "url": "https://andrewmarsh.com/apps/releases/supershapes.html",
                        "img": "/assets/home/img/supershapes.png"
                    },
                    {
                        "name": "Mockup world",
                        "url": "https://www.mockupworld.co",
                        "img": "/assets/home/img/mockupworld.png"
                    },
                    {
                        "name": "Laws of UX",
                        "url": "https://lawsofux.com",
                        "img": "/assets/home/img/lawsofux.png"
                    }
                ]
            },
            {
                "name": "Sound",
                "img": "/assets/home/img/sound.png",
                "bookmark": [
                    {
                        "name": "freesound",
                        "url": "https://freesound.org",
                        "img": "/assets/home/img/freesound.png"
                    }
                ]
            },
            {
                "name": "Cook",
                "img": "/assets/home/img/cook.png",
                "bookmark": [
                    {
                        "name": "nyt cooking",
                        "url": "https://cooking.nytimes.com",
                        "img": "/assets/home/img/nytcooking.png"
                    },
                    {
                        "name": "precycle groceries",
                        "url": "https://www.precyclenyc.com",
                        "img": "/assets/home/img/precycle.png"
                    },
                    {
                        "name": "Happy Cow vegan reviews",
                        "url": "https://www.happycow.net",
                        "img": "/assets/home/img/happycow.png"
                    },
                    {
                        "name": "yelp",
                        "url": "https://www.yelp.com",
                        "img": "/assets/home/img/yelp.png"
                    }
                ]
            },
            {
                "name": "Medical",
                "img": "/assets/home/img/medicine.png",
                "bookmark": [
                    {
                        "name": "One Medical",
                        "url": "https://app.onemedical.com/",
                        "img": "/assets/home/img/onemedical.png"
                    },
                    {
                        "name": "CVS",
                        "url": "https://www.cvs.com",
                        "img": "/assets/home/img/cvs.png"
                    },
                    {
                        "name": "Anthem Insurance",
                        "url": "https://membersecure.anthem.com/member/dashboard",
                        "img": "/assets/home/img/anthem.png"
                    }
                ]
            },
            {
                "name": "Home",
                "img": "/assets/home/img/home.png",
                "bookmark": [
                    {
                        "name": "Verizon Fios",
                        "url": "https://www.verizon.com/home/myverizon/",
                        "img": "/assets/home/img/verizon.png"
                    },
                    {
                        "name": "ConEd",
                        "url": "https://www.coned.com/en",
                        "img": "/assets/home/img/coned.png"
                    }
                ]
            },
            {
                "name": "Art",
                "img": "/assets/home/img/art.png",
                "bookmark": [
                    {
                        "name": "Google arts and culture",
                        "url": "https://artsandculture.google.com/explore",
                        "img": "/assets/home/img/artsculture.png"
                    }
                ]
            },
            {
                "name": "Listen",
                "img": "/assets/home/img/listen.png",
                "bookmark": [
                    {
                        "name": "MyNoise",
                        "url": "https://mynoise.net/noiseMachines.php",
                        "img": "/assets/home/img/mynoise.png"
                    },
                    {
                        "name": "Genius",
                        "url": "https://genius.com",
                        "img": "/assets/home/img/genius.png"
                    },
                    {
                        "name": "ratemymusic rateyourmusic",
                        "url": "https://rateyourmusic.com/new-music/",
                        "img": "/assets/home/img/rateyourmusic.png"
                    },
                    {
                        "name": "playlist analyzer chosic",
                        "url": "https://www.chosic.com/spotify-playlist-analyzer/",
                        "img": "/assets/home/img/chosic.png"
                    },
                    {
                        "name": "Every noise",
                        "url": "https://everynoise.com",
                        "img": "/assets/home/img/everynoise.png"
                    }
                ]
            },
            {
                "name": "Watch",
                "img": "/assets/home/img/watch.png",
                "bookmark": [
                    {
                        "name": "Youtube",
                        "url": "https://www.youtube.com/feed/subscriptions",
                        "img": "/assets/home/img/youtube.png"
                    },
                    {
                        "name": "Twitch",
                        "url": "https://www.twitch.tv",
                        "img": "/assets/home/img/twitch.png"
                    },
                    {
                        "name": "Netflix",
                        "url": "https://www.netflix.com/browse",
                        "img": "/assets/home/img/netflix.png"
                    },
                    {
                        "name": "Disney Plus",
                        "url": "https://www.disneyplus.com/home",
                        "img": "/assets/home/img/disneyplus.png"
                    },
                    {
                        "name": "hulu",
                        "url": "https://www.hulu.com/hub/home",
                        "img": "/assets/home/img/hulu.png"
                    }
                ]
            },
            {
                "name": "Game",
                "img": "/assets/home/img/game.png",
                "bookmark": [
                    {
                        "name": "Geoguessr",
                        "url": "https://www.geoguessr.com",
                        "img": "/assets/home/img/geoguessr.png"
                    },
                    {
                        "name": "Trivia Generator",
                        "url": "https://www.randomtriviagenerator.com",
                        "img": "/assets/home/img/triviagenerator.png"
                    },
                    {
                        "name": "Modrinth",
                        "url": "https://modrinth.com",
                        "img": "/assets/home/img/modrinth.png"
                    },
                    {
                        "name": "Minecraft wiki",
                        "url": "https://minecraft.wiki",
                        "img": "/assets/home/img/minecraft.png"
                    },
                    {
                        "name": "Stardew Valley wiki",
                        "url": "https://stardewvalleywiki.com",
                        "img": "/assets/home/img/stardewvalley.png"
                    }
                ]
            },
            {
                "name": "Shop",
                "img": "/assets/home/img/shop.png",
                "bookmark": [
                    {
                        "name": "Amazon",
                        "url": "https://smile.amazon.com",
                        "img": "/assets/home/img/amazon.png"
                    },
                    {
                        "name": "Target",
                        "url": "https://target.com",
                        "img": "/assets/home/img/target.png"
                    },
                    {
                        "name": "grove",
                        "url": "https://www.grove.co",
                        "img": "/assets/home/img/grove.png"
                    }
                ]
            },
            {
                "name": "Travel",
                "img": "/assets/home/img/travel.png",
                "bookmark": [
                    {
                        "name": "Rome to rio",
                        "url": "https://www.rome2rio.com",
                        "img": "/assets/home/img/rometorio.png"
                    },
                    {
                        "name": "Google Flights",
                        "url": "https://www.google.com/flights",
                        "img": "/assets/home/img/googleflights.png"
                    },
                    {
                        "name": "Tripadvisor",
                        "url": "https://www.tripadvisor.com",
                        "img": "/assets/home/img/tripadvisor.png"
                    },
                    {
                        "name": "Atlas Obscura",
                        "url": "https://www.atlasobscura.com",
                        "img": "/assets/home/img/atlasobscura.png"
                    }
                ]
            },
            {
                "name": "Utilities",
                "img": "/assets/home/img/utilities.png",
                "bookmark": [
                    {
                        "name": "Anon Temp mail email",
                        "url": "https://temp-mail.org/en/",
                        "img": "/assets/home/img/anonaddy.png"
                    },
                    {
                        "name": "Sharedrop file airdrop",
                        "url": "https://sharedrop.io",
                        "img": "/assets/home/img/sharedrop.png"
                    },
                    {
                        "name": "Cloud Convert file",
                        "url": "https://cloudconvert.com",
                        "img": "/assets/home/img/cloudconvert.png"
                    },
                    {
                        "name": "Translate",
                        "url": "https://translate.google.com",
                        "img": "/assets/home/img/googletranslate.png"
                    },
                    {
                        "name": "Internet Archive Wayback Machine",
                        "url": "https://web.archive.org",
                        "img": "/assets/home/img/internetarchive.png"
                    },
                    {
                        "name": "Airplane Tracker",
                        "url": "https://globe.adsbexchange.com",
                        "img": "/assets/home/img/adsb.png"
                    },
                    {
                        "name": "Mac Apps",
                        "url": "https://appstorrent.ru/",
                        "img": "/assets/home/img/appstorrent.png"
                    }
                ]
            }
        ]
    };
    const [bookmarks, setBookmarks] = useState<any>(data);

    useEffect(() => {
        setSelectedBookmark(null);

        // TODO: Move into bookmark collection class
        const newBookmarks = {
            sections: data.sections.reverse().map((section: Section) => {
                return {
                    ...section, bookmark: section.bookmark.reverse().map((bookmark: Bookmark) => {
                        if (bookmark.name.toLowerCase().substring(0, searchText.length) === searchText.toLowerCase()) {
                            setSelectedBookmark(bookmark);
                            return { ...bookmark, status: 'selected' };
                        }
                        return bookmark.name.toLowerCase().includes(searchText.toLowerCase()) ? bookmark : { ...bookmark, status: 'hidden' };
                    }).reverse()
                };
            }).reverse()
        };

        setBookmarks({
            sections: newBookmarks.sections.filter((section: Section) => {
                return section.bookmark.filter((bookmark: Bookmark) => bookmark.status !== 'hidden').length > 0;
            })
        });

    }, [searchText]);

    return (
        <div className={styles.bookmarks}>
            {bookmarks.sections.map((section: Section, index: number) => (
                <BookmarkSection {...section} key={'section-' + index} />
            ))}
        </div>
    );
}

function BookmarkSection({ name, img, bookmark }: { name: string, img: string, bookmark: { name: string, url: string, img: string, status?: string }[] }) {
    return (
        <div className={styles.bookmarkSection}>
            <div className={styles.bookmarkSectionMarker}>
                <div className={styles.bookmarkSectionIcon}>
                    <Image src={img} title={name} alt={name} width={500} height={500} />
                </div>
            </div>
            {bookmark.map((b, index) => (
                <Bookmark {...b} key={'bookmark-' + index} />
            ))}
        </div>
    );
}

function Bookmark({ name, url, img, status }: { name: string, url: string, img: string, status?: string }) {
    return (
        <div className={styles.bookmark + ' ' + (status === 'hidden' ? styles.hidden : '') + ' ' + (status === 'selected' ? styles.selectedBookmark : '')} >
            <a href={url} className={styles.bookmarkAnchor}></a>
            <Image src={img} title={name} alt={name} width={500} height={500} />
        </div>
    );
}