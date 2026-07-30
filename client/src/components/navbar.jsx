import React, { useState } from 'react';
import './navbar.css';
import { NavLink, useNavigate } from 'react-router-dom';
import { IoIosArrowDropdown, IoIosCloseCircleOutline } from 'react-icons/io';
import { useUser } from '../userContext';
import { FaBasketballBall } from "react-icons/fa";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8081';

export default function Navbar() {
  const [isNavExpanded, setIsNavExpanded] = useState(false);
  const { user, setUser } = useUser();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/profile/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (response.ok) {
        setUser({
          isAuthenticated: false,
          isLineMonitor: false,
          isSuperUser: false,
          firstName: null,
          lastName: null,
          email: null,
        });
        localStorage.removeItem('token');
        navigate('/login');
      } else {
        const error = await response.json();
        console.error('Logout failed:', error.message);
      }
    } catch (error) {
      console.error('Logout request error:', error.message);
    }
  };

  const closeMenu = () => {
    setIsNavExpanded(false);
  };

  return (
    <nav className='nav-shell'>
      <div className="nav-bubble">
        {/* Logo / App Name */}
        <NavLink
          to="/"
          className="app-name"
          onClick={closeMenu}
          aria-label="K-Ville Nation home"
        >
          <FaBasketballBall className="app-icon" />
          K-Ville Nation
        </NavLink>

        {/* LEFT SECTION (nav menu + mobile toggle) */}
        <div className="nav-section left">
          {/* Hamburger icon (mobile only) */}
          <button
            className="nav-toggle"
            onClick={() => setIsNavExpanded(!isNavExpanded)}
            aria-label="Toggle Menu"
          >
            {isNavExpanded ? <IoIosCloseCircleOutline /> : <IoIosArrowDropdown />}
          </button>

          <div className={`nav-menu ${isNavExpanded ? 'show' : ''}`}>
            <NavLink
              to="/history"
              className="nav-link"
              activeclassname="active"
              onClick={closeMenu}
            >
              History
            </NavLink>
            <NavLink
              to="/policy"
              className="nav-link"
              activeclassname="active"
              onClick={closeMenu}
            >
              Policy
            </NavLink>
            <NavLink
              to="/game-days"
              className="nav-link"
              activeclassname="active"
              onClick={closeMenu}
            >
              Game Days
            </NavLink>
            <NavLink
              to="/tenting"
              className="nav-link"
              activeclassname="active"
              onClick={closeMenu}
            >
              Tenting
            </NavLink>
            <NavLink
              to="/calendar"
              className="nav-link"
              activeclassname="active"
              onClick={closeMenu}
            >
              Calendar
            </NavLink>
            <NavLink
              to="/faqs"
              className="nav-link"
              activeClassName="active"
              onClick={closeMenu}
            >
              FAQs
            </NavLink>
            <NavLink
              to="/contacts"
              className="nav-link"
              activeClassName="active"
              onClick={closeMenu}
            >
              Contact Us
            </NavLink>
            {user.isLineMonitor && (
              <NavLink
                to="/tent-check"
                className="nav-link"
                activeclassname="active"
                onClick={closeMenu}
              >
                Tent Check
              </NavLink>
            )}
            {user.isSuperUser && (
              <NavLink
                to="/line-monitor-dashboard"
                className="nav-link"
                activeclassname="active"
                onClick={closeMenu}
              >
                LM Dashboard
              </NavLink>
            )}

            {/* MOBILE-ONLY AUTH LINKS */}
            <div className="mobile-auth-links">
              {user.isAuthenticated ? (
                <>
                  <NavLink
                    to="/profile"
                    className="nav-link"
                    activeclassname="active"
                    onClick={closeMenu}
                  >
                    Hello, {user.firstName || 'User'}
                  </NavLink>
                  <NavLink
                    to="/#"
                    onClick={() => {
                      handleLogout();
                      closeMenu();
                    }}
                    className="nav-link logout-button"
                  >
                    Logout
                  </NavLink>
                </>
              ) : (
                <NavLink
                  to="/login"
                  className="nav-link"
                  activeclassname="active"
                  onClick={closeMenu}
                >
                  Sign In
                </NavLink>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT SECTION (desktop-only) */}
        <div className="nav-section right">
        {user.isAuthenticated ? (
                <>
                  <NavLink
                    to="/profile"
                    className="nav-link"
                    activeclassname="active"
                    onClick={closeMenu}
                  >
                    Hello, {user.firstName || 'User'}
                  </NavLink>
                  <NavLink
                    to="/#"
                    onClick={() => {
                      handleLogout();
                      closeMenu();
                    }}
                    className="nav-link logout-button no-active"
                  >
                    Logout
                  </NavLink>
                </>
              ) : (
                <NavLink
                  to="/login"
                  className="nav-link"
                  activeclassname="active"
                  onClick={closeMenu}
                >
                  Sign In
                </NavLink>
              )}
        </div>
      </div>
    </nav>
  );
}