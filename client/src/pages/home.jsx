import React, { useState, useEffect } from 'react';
import axios from 'axios';
import "../styles/home.css";
import bannerImage from '../images/kvillenationbanner.png';
import InstagramEmbedKvilleNation from '../components/kville_official_ig.jsx';
import InstagramEmbedDukeMBB from '../components/dukembb_ig.jsx';
import SpotifyEmbed from '../components/spotifyEmbed.jsx';


const Home = () => {
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL
  const [data, setData] = useState({
    record: '',
    standing: '',
    nextOpponent: '',
    rank: '',
    numTents: null,
  });
  const [tentLink, setTentLink] = useState('');
  const [linkActive, setLinkActive] = useState(false);
  const [inSeason, setInSeason] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/tent-link`)
      .then(res => res.json())
      .then(linkData => {
        setTentLink(linkData.url || '');
        setLinkActive(linkData.active ?? false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/season-status`)
      .then((res) => res.json())
      .then((statusData) => {
        setInSeason(!!statusData.inSeason);
      })
      .catch(() => {
        setInSeason(true); // fallback if error
      });
  }, [API_BASE_URL]);


  const handleRegisterClick = () => {
    if (tentLink) {
      window.location.href = tentLink;
    } else {
      alert('Tent registration link is not set yet.');
    }
  };
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(
          'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/duke'
        );
        const teamData = response.data.team;

        let record = teamData.record.items[0].summary || '0-0';
        let standing = teamData.standingSummary || 'TBD';
        let nextOpponent = 'TBD';
        let rank = teamData.rank || 'TBD';

        const homeTeam = teamData.nextEvent[0].competitions[0].competitors[0].team.displayName;
        const awayTeam = teamData.nextEvent[0].competitions[0].competitors[1].team.displayName;
        nextOpponent = homeTeam === "Duke Blue Devils" ? awayTeam : homeTeam;

        let numTents = 0; // Fetch this value later

        setData({ record, standing, nextOpponent, rank, numTents });
      } catch (error) {
        console.error('Error fetching data: ', error);
      }
    };

    fetchData();
  }, []);
  useEffect(() => {
  // Don't do anything until we've actually loaded season status
  if (inSeason === null) return;

  let cancelled = false;

  const fetchTentsCount = async () => {
    try {
      if (!inSeason) {
        // Off-season: force 0 and skip the API call
        if (!cancelled) {
          setData((prevData) => ({ ...prevData, numTents: 0 }));
        }
        return;
      }

      // In-season: fetch real tent count
      const response = await axios.get(`${API_BASE_URL}/api/tent-checks`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (cancelled) return; // ignore if effect has been cleaned up

      const tents = response.data;
      setData((prevData) => ({ ...prevData, numTents: tents.length }));
    } catch (error) {
      if (!cancelled) {
        console.error('Error fetching tent count:', error);
      }
    }
  };

  fetchTentsCount();

  return () => {
    // this will be run before the next effect or on unmount,
    // so old async calls won't update state
    cancelled = true;
  };
}, [inSeason, API_BASE_URL]);

  return (
    <>
    <div className="all-of-home">
        <div className="bubble-container">
        <div className="header">
            <img src={bannerImage} alt="Kville Nation Banner" />
        </div>
        </div>

        <div className="bubble-container">
            <div className="stats-row">
                <div className="stat-box">
                <div>AP RANK</div>
                <div className='dukeStats'>{data.rank || "TBD"}</div>
                </div>
                <div className="stat-box">
                <div>RECORD</div>
                <div className='dukeStats'>{data.record || "0-0"}</div>
                </div>
                <div className="stat-box">
                <div>STANDING</div>
                <div className='dukeStats'>{data.standing || "TBD"}</div>
                </div>
                <div className="stat-box">
                <div>NEXT OPPONENT</div>
                <div className='dukeStats'>{data.nextOpponent || "TBD"}</div>
                </div>
                <div className="stat-box">
                <div>NUMBER OF TENTS IN K-VILLE</div>
                <div className='dukeStats'>{data.numTents ?? "TBD"}</div>
                </div>
            </div>
        </div>
        {/* MEDIA SECTION: 
            Row 1 => [ Register | (spans 2 cols) Spotify ]
            Row 2 => [ IG | IG | Spotify ] */}
        <div className="media-grid">
          <div className="register-card">
            <button
              className="register-button"
              onClick={handleRegisterClick}
              disabled={!linkActive}
            >
              {linkActive ? "Register a Tent!" : "Registration Closed"}
            </button>
          </div>

          <div className="ig-card final-home-row">
            <InstagramEmbedKvilleNation />
          </div>

          <div className="ig-card final-home-row">
            <InstagramEmbedDukeMBB />
          </div>

          <div className="spotify-card bubble-container-spotify">
            <SpotifyEmbed />
          </div>
        </div>
    </div>
    </>
    );
};
    
export default Home;
