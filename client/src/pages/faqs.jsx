import React, { useState } from 'react';
import { Link } from "react-router-dom";
import kvilleBoundaries from "../images/kvilleboundaries.png"
import '../styles/faqs.css';

function FAQs() {

    const faqs = [
        {
          q: "What are the K-Ville boundaries?",
          a: (
            <div className="img-answer-content">
              <img 
                src={kvilleBoundaries}
                className="img-answer"
                alt='kville-boundaries' 
              />
              <p>
                Krzyzewskiville is formally defined as the grassy lawn area in front of Card and
                Wilson gyms, their surrounding sidewalks, and the plaza in front of Cameron and
                the Schwartz-Butters Building. Students who are on duty for their tent or walk-up line
                group should remain within these boundaries at all times unless given specific permission
                from a Line Monitor. Otherwise, if a check is called and you are not within the specified 
                boundaries while on shift, it will count as a missed check.
              </p>
            </div>
          ),
        },
        {
          q: "How do I go to a (non-UNC) home Duke basketball game?",
          a: (
            <div>
              <p>
                Register for the walk-up line (WUL)! The walk-up line is a process that students partake
                in to gain entry to home games (with the exception of the UNC game). To register, one-third
                of your group must visit the Line Monitor table at the front of K-Ville in order to be added to 
                the list. When registering, you will give your group size as a multiple of three, rounding up when
                necessary. Once your group is registered, one-third of your group must be in K-Ville at all times.
                For example: a group of 10 people would register as a group of 12, and 4 of them must
                be in K-Ville at all times. When you first check in for your group, you will be required to
                show your Duke Card; there is no need to check out when your shift is over. Additionally, 
                checks will be called by Line Monitors at random points throughout the day; there is 
                <strong> no </strong> grace period between checks.
              </p>
              <p>
                For most games, WUL registration is open from 7am on game day until two hours before game time.
                Different rules and start times will apply for "Designated Big Games." The specific games for the
                current season can be found in the policy, but will be further communicated by the Head Line Monitors
                and VPs of Gameday throughout. Two hours before the scheduled game start time, your entire group must
                be in K-Ville for line up.
              </p>
              <p>
                <strong>
                For a more detailed description of the walk-up line, please see Section 2 of our{" "}
                <Link to="/policy">Official Policy</Link>.
                </strong>
              </p>
            </div>
          ),
        },
        {
          q: "What are the different tenting tests and what do they mean?",
          a: (
            <div>
              <p>
              The Black Tenting Test (“Entry Test”) will occur if more than 80 tents register for Black tenting
              within the first 48 hours of tent registration; test content will be based on the current Duke MBB
              season only. Tents that score within the top 70 will receive a Black tenting spot, and tents scoring
              71-80 will receive a Blue tenting spot in the order of their score.
              </p>
              <p>
              The Ordering Test happens every year and is only for Black tenters. In contrast to the entry test, 
              it tests <strong> all </strong> of Duke MBB history. Your tent’s score will factor into the eventual ordering of Black tents.
              </p>
            </div>
          ),
        },
        {
          q: "What does it mean to Dirty Black or Dirty Blue tent?",
          a: (
            <div> 
              <p>
              This is only relevant if there is NOT an entry test in a given season. “Dirty Tenting” means that your tent began
              tenting after the first day of a tenting period (either Black or Blue). For instance, a tent starting in the middle
              of Black tenting would be classified as a Dirty Black tent.
              </p>
              <p>
              Dirty Black tents starting after the beginning of the Black Tenting period, but before the start of Blue Tenting, will
              all be ordered on a first-come, first-served basis after Black Tents that started at the beginning. In the event that
              multiple Dirty Black tents choose to pitch on the same day, the ordering will be determined by the time at which the online
              form was submitted.
              </p>
              <p>
              Dirty Blue tents starting after the beginning of the Blue Tenting period, but before the start of White Tenting, will all
              be ordered on a first-come, first-served basis after Blue Tents that started at the beginning. In the event that multiple
              Dirty Blue Tents choose to pitch on the same day, the ordering will be determined by the time at which the online form was
              submitted.
              </p>
            </div>
          ),
        },
        {
          q: "Can we change who is in our tent after we have registered our tent?",
          a: (
            <p>
            Each tent will have a five-day period after they begin tenting during which they can change their roster. 
            After those five days, any roster changes must be emailed to tenting.kville@gmail.com and be approved by the VPs
            of Tenting and/or Head Line Monitors. If you are using tenting equipment from the K-Ville Loaner Program, the deadline
            to switch into or out of a group is designated in the policy.
            </p>
          ),
        },
        {
          q: "When do we get grace during tenting?",
          a: (
            <div>
              <p>
              As a reminder, there is <strong> no </strong> grace for WUL–the following conditions only apply
              to those tenting for the UNC game. Grace will occur: 
              </p>
              <p>
                <strong> After every tent check for one hour. </strong>
              </p>
              <p>
                <strong> Two hours before and after a Men’s or Women’s home basketball game. </strong>
              </p>
              <p>
                <strong> One hour before and after a Men’s or Women’s away basketball game. </strong>
              </p>
              <p>
                <strong> Weather-related grace is given in the following circumstances: Temperatures below or equal to 32°F, 
                greater than 2” of accumulated snow, sustained winds higher than 35 mph, lightning within a six-mile radius, 
                severe weather warnings, icy conditions, school closure. </strong>
              </p>
              <p>
                <strong> At any time, for any length at the discretion of the Head Line Monitors. </strong>
              </p>
              <p>
                Note that grace will <strong> always </strong> be communicated by Line Monitors in the shared Slack channel, 
                which will be sent to all tenters early in the spring semester.
              </p>
            </div>
          ),
        },
        {
          q: "Can I tent for UNC and wait in line for other games at the same time?",
          a: (
            <p>
            Yes! A group’s position in the line for UNC does not dictate position in line for any other game and vice versa.
            Additionally, the use of tents for Designated Big Games in no way relates to tenting for the Carolina game.
            </p>
          ),
        },
        {
          q: "I am worried about the financial and/or physical burden of tenting. Does Duke provide resources to help with this?",
          a: (
            <div>
              <p>
                Yes! For financial concerns, the Tenting Loaner Program is available to provide tenters with free equipment such as sleeping bags,
                lanterns, etc. Need-related assessments will be conducted by Student Involvement and Leadership and details on how to apply 
                will be sent out near the end of the fall semester. For accessibility accommodations needed for WUL, tenting, accessible seating in
                Cameron, etc., please reach out to the Head Line Monitors (headlinemonitor@gmail.com) or our representative in the SDAO office (leigh.millar@duke.edu). 
              </p>
              <p>
                <strong>
                Contact information can additionally be found on our{" "}
                <Link to="/contacts">Contact Us</Link> page.
                </strong>
              </p>
            </div>
          ),
        },
      ];

      const [openIndexes, setOpenIndexes] = useState([]);

      const toggleAnswer = (index) => {
        if (openIndexes.includes(index)) {
          setOpenIndexes(openIndexes.filter((i) => i !== index));
        } else {
          setOpenIndexes([...openIndexes, index]);
        }
      };
    
      return (
        <div className="faqs">
          <p className="title">Frequently Asked Questions</p>
          <p className="content">
            For any additional questions not answered here, please refer to our{" "}
            <Link to="/contacts" className="contacts-link">
              Contact Us
            </Link>{" "}
            page to see who to reach out to.
          </p>
          {faqs.map((item, index) => (
            <div
              key={index}
              className={`box ${openIndexes.includes(index) ? "open" : ""}`}
            >
              <div
                className="header"
                onClick={() => toggleAnswer(index)}
              >
                <span>{index + 1}. {item.q}</span>
                <span className="arrow">
                  {openIndexes.includes(index) ? "▲" : "▼"}
                </span>
              </div>
              <div
                className={`answer ${openIndexes.includes(index) ? "open" : ""}`}
              >
                {item.a}
              </div>
            </div>
          ))}
        </div>
      );
    }

export default FAQs;
