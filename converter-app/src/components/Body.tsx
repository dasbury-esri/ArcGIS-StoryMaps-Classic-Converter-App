
import React, { useState }  from "react";
import EnterpriseSignInModal from "./EnterpriseSignInModal";
import { useAuth } from "../auth/useAuth";
import mapTourImg from "../assets/storymap-map-tour.png";
import mapJournalImg from "../assets/storymap-map-journal.png";
import mapSeriesTabbedImg from "../assets/storymap-series-tabbed.png";
import cascadeImg from "../assets/storymap-cascade.png";
import shortlistImg from "../assets/storymap-shortlist.png";
import crowdsourceImg from "../assets/storymap-crowdsource.png";
import { ENABLED } from "./enabledTemplates";
import swipeImg from "../assets/storymap-swipe.png";
import basicImg from "../assets/storymap-basic.png";

interface TileConfig {
    key: string;
    title: string;
    description: string;
    image: string;
    status: 'active' | 'disabled';
    alt: string;
}

// Feature gating imported from shared module

const tiles: TileConfig[] = [
    {
        key: 'mapTour',
        title: 'Map Tour',
        description: 'Presented a sequential, place-based narrative with geotagged photos linked to an interactive map.',
        image: mapTourImg,
        status: ENABLED.mapTour ? 'active' : 'disabled',
        alt: 'Map Tour Thumbnail'
    },
    {
        key: 'mapJournal',
        title: 'Map Journal',
        description: 'Presented a compelling map-based narrative presented as a set of journal entries.',
        image: mapJournalImg,
        status: ENABLED.mapJournal ? 'active' : 'disabled',
        alt: 'Map Journal Thumbnail'
    },
    {
        key: 'mapSeries',
        title: 'Map Series',
        description: 'Presented a series of maps via a set of tabs, bullets or expanding side panel.',
        image: mapSeriesTabbedImg,
        status: ENABLED.mapSeries ? 'active' : 'disabled',
        alt: 'Map Series - Tabbed Thumbnail'
    },
    {
        key: 'cascade',
        title: 'Cascade',
        description: 'Combined text with maps, images, and multimedia in an engaging, full-screen scrolling experience.',
        image: cascadeImg,
        status: ENABLED.cascade ? 'active' : 'disabled',
        alt: 'Cascade Thumbnail'
    },
    {
        key: 'shortlist',
        title: 'Shortlist',
        description: 'Presented a set of places organized into a set of tabs based on themes.',
        image: shortlistImg,
        status: ENABLED.shortlist ? 'active' : 'disabled',
        alt: 'Shortlist Thumbnail'
    },
    {
        key: 'crowdsource',
        title: 'Crowdsource',
        description: 'Displayed crowdsourced photos with captions. The conversion will be view-only.',
        image: crowdsourceImg,
        status: ENABLED.crowdsource ? 'active' : 'disabled',
        alt: 'Crowdsource Thumbnail'
    },
    {
        key: 'swipe',
        title: 'Swipe',
        description: 'Displayed two layers or two maps side by side for comparison.',
        image: swipeImg,
        status: ENABLED.swipe ? 'active' : 'disabled',
        alt: 'Swipe Thumbnail'
    },
    {
        key: 'basic',
        title: 'Basic',
        description: 'Presented a map via a minimalist interface. Converted to an ArcGIS Instant App.',
        image: basicImg,
        status: ENABLED.basic ? 'active' : 'disabled',
        alt: 'Story Map Basic Thumbnail'
    }
];

const Body = () => {
    const { signIn } = useAuth();
    const [showPortalModal, setShowPortalModal] = useState(false);

    return (
        <>
            <div id="splashContainer" className="splash-container">
                <div className="jumbotron">
                    <h2>Classic StoryMap Converter</h2>
                    <p className="lead">Convert Classic Esri Story Maps to ArcGIS StoryMaps</p>
                    <div className="loginButtons">
                        <p>
                            <button
                                type="button"
                                className="btn btn-lg btn-block btn-success login-btn"
                                onClick={signIn}
                            >
                                Log in to ArcGIS Online
                            </button>
                            <button
                                type="button"
                                className="btn btn-lg btn-block btn-default"
                                onClick={() => setShowPortalModal(true)}
                            >
                                Log in to Portal for ArcGIS
                            </button>
                        </p>
                    </div>
                </div>
                <div className="row marketing marketing-row">
                    {tiles.map(tile => {
                        const disabled = tile.status !== 'active';
                        return (
                                                        <div
                                                                key={tile.key}
                                                                className={`marketing-col${disabled ? ' disabled' : ''}`}
                                                                data-disabled={disabled ? 'true' : 'false'}
                                                        >
                                <h4>{tile.title}</h4>
                                <div className="marketing-img-container">
                                    <img src={tile.image} alt={tile.alt} className="marketing-img" />
                                    {disabled && <div className="disabled-overlay">Coming Soon</div>}
                                </div>
                                <p>{tile.description}</p>
                            </div>
                        );
                    })}
                </div>
            </div>
            <EnterpriseSignInModal
              open={showPortalModal}
              onCancel={() => setShowPortalModal(false)}
              onContinue={(url, appId) => {
                // TODO: wire login flow with provided values
                setShowPortalModal(false);
                console.info('[EnterpriseSignInModal] continue', { url, appId });
              }}
            />
        </>
  );
};

export default Body