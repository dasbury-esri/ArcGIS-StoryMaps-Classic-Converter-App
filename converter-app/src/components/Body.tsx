
import React, { useState }  from "react";
import { useAuth } from "../auth/useAuth";


const Body = () => {
    const { signIn } = useAuth();
    const [showPortalModal, setShowPortalModal] = useState(false);

    return (
        <>
            <div id="splashContainer" className="splash-container">
                <div className="jumbotron">
                    <h2>Classic StoryMap Converter</h2>
                    <p className="lead">Convert Classic StoryMaps (Map Tour, Map Journal, Map Series, Cascade) to ArcGIS StoryMaps</p>
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
                    <div className="marketing-col">
                        <h4>Map Tour</h4>
                        <p>View the underlying JSON for any item in ArcGIS Online or your Portal.</p>
                    </div>
                    <div className="marketing-col">
                        <h4>Map Journal</h4>
                        <p>Modify the URLs for services in web maps and registered applications.</p>
                    </div>
                    <div className="marketing-col">
                        <h4>Map Series</h4>
                        <p>Search for and copy content to your account and other accounts.</p>
                    </div>
                    <div className="marketing-col">
                        <h4>Cascade</h4>
                        <p>Search for and copy content to your account and other accounts.</p>
                    </div>
                </div>
                <div className="row marketing marketing-row">
                    <div className="marketing-col">
                        <h4>Shortlist</h4>
                        <p>View the underlying JSON for any item in ArcGIS Online or your Portal.</p>
                    </div>
                    <div className="marketing-col">
                        <h4>Crowdsource</h4>
                        <p>Modify the URLs for services in web maps and registered applications.</p>
                    </div>
                    <div className="marketing-col">
                        <h4>Swipe</h4>
                        <p>Search for and copy content to your account and other accounts.</p>
                    </div>
                    <div className="marketing-col">
                        <h4>Basic</h4>
                        <p>Search for and copy content to your account and other accounts.</p>
                    </div>
                </div>
            </div>
            {showPortalModal && (
                <div id="portalLoginModal" className="modal fade" tabIndex={-1} role="dialog" aria-labelledby="portalLoginLabel" aria-hidden="true">
                    <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <button type="button" className="close" aria-hidden="true" onClick={() => setShowPortalModal(false)}>x</button>
                                <h3 id="portalLoginLabel">Log in to your Portal</h3>
                            </div>
                            <div className="modal-body">
                                <form>
                                    <p>Enter the URL to your Portal</p>
                                    <div className="form-group has-feedback">
                                        <div className="input-group">
                                            <input type="text" className="form-control portalUrl portal-input" placeholder="https://myportal.domain.com/webadaptor" aria-label="..." id="portalUrl" />
                                            <i className="glyphicon form-control-feedback portal-icon" aria-hidden="true"></i>
                                            <div className="input-group-btn">
                                                <button type="button" className="btn btn-default dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" id="portalListBtn" disabled><span className="caret"></span></button>
                                                <ul className="dropdown-menu dropdown-menu-right" role="menu" id="portalList">
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                    <br />
                                    <div>
                                        {/* Nav tabs */}
                                        <ul className="nav nav-tabs" role="tablist">
                                            <li role="presentation" className="active"><a href="#userPassTab" id="userPassTabBtn" aria-controls="userPassTab" role="tab" data-toggle="tab">Direct Login</a></li>
                                            <li role="presentation"><a href="#oauthTab" id="oauthTabBtn" aria-controls="oauthTab" role="tab" data-toggle="tab">OAuth Login</a></li>
                                            <li role="presentation"><a href="#pkiIwaTab" id="pkiIwaTabBtn" aria-controls="pkiIwaTab" role="tab" data-toggle="tab">PKI or IWA Login</a></li>
                                        </ul>
                                        {/* Tab panes */}
                                        <div className="tab-content">
                                            <div role="tabpanel" className="tab-pane active" id="userPassTab">
                                                <div id="portalLoginForm" className="form-horizontal">
                                                    <br />
                                                    <div className="form-group">
                                                        <label htmlFor="portalUsername" className="col-sm-2 control-label">Username</label>
                                                        <div className="col-sm-6">
                                                            <input className="form-control" type="text" placeholder="username" id="portalUsername" />
                                                        </div>
                                                    </div>
                                                    <div className="form-group">
                                                        <label htmlFor="portalPassword" className="col-sm-2 control-label">Password</label>
                                                        <div className="col-sm-6">
                                                            <input className="form-control" type="password" placeholder="password" id="portalPassword" />
                                                        </div>
                                                    </div>
                                                    <a data-toggle="collapse" href="#collapseInfo0" aria-expanded="false" aria-controls="collapseInfo0">
                                                        More info <span className="glyphicon glyphicon-info-sign" aria-hidden="true"></span>
                                                    </a>
                                                </div>
                                                <div className="collapse" id="collapseInfo0">
                                                    <div className="well">
                                                        This login method makes use of a direct call to the
                                                        <a href="https://developers.arcgis.com/rest/users-groups-and-items/generate-token.htm" target="_blank" rel="noopener">GenerateToken</a>
                                                        operation of the ArcGIS REST API on your Portal host. Username and Password are case-sensitive.
                                                    </div>
                                                </div>
                                            </div>
                                            <div role="tabpanel" className="tab-pane" id="oauthTab">
                                                <div id="portalLoginForm2" className="form-horizontal">
                                                    <br />
                                                    <div className="form-group">
                                                        <label htmlFor="portalAppId" className="col-sm-2 control-label">App ID</label>
                                                        <div className="col-sm-6">
                                                            <input className="form-control" type="text" placeholder="App ID" id="portalAppId" aria-describedby="ouathMore" />
                                                        </div>
                                                    </div>
                                                    <a data-toggle="collapse" href="#collapseInfo1" aria-expanded="false" aria-controls="collapseInfo1">
                                                        More info <span className="glyphicon glyphicon-info-sign" aria-hidden="true"></span>
                                                    </a>
                                                </div>
                                                <div className="collapse" id="collapseInfo1">
                                                    <div className="well">
                                                        In order to log in to a Portal for ArcGIS instance using a SAML-based Identity Provider,
                                                        you will need to Register AGO-Assistant as an application in your Portal, to generate an
                                                        AppID that can identify this app as an allowed client of the Portal. To do so, follow the
                                                        instructions
                                                        <u><a href="https://enterprise.arcgis.com/en/portal/latest/administer/windows/add-items.htm#ESRI_SECTION1_0D1B620254F745AE84F394289F8AF44B" target="_blank" rel="noopener">here</a></u>,
                                                        using <strong>Application</strong> as the <strong><em>Type of App</em></strong> and <mark><span id="currentUrl"></span></mark> as the
                                                        Redirect URI.
                                                    </div>
                                                </div>
                                            </div>
                                            <div role="tabpanel" className="tab-pane" id="pkiIwaTab">
                                                <br />
                                                <div>
                                                    <a data-toggle="collapse" href="#collapseInfo2" aria-expanded="false" aria-controls="collapseInfo2">
                                                        More info <span className="glyphicon glyphicon-info-sign" aria-hidden="true"></span>
                                                    </a>
                                                </div>
                                                <div className="collapse" id="collapseInfo2">
                                                    <div className="well">
                                                        This login method is used for Portals with web-tier authentication, using username and
                                                        password or client certificate (PKI) authentication methods, often referred to as “SSO”
                                                        or Single Sign On. This authentication method is most often used for internal-facing
                                                        Portals inside of an intranet.
                                                        <a href="http://server.arcgis.com/en/portal/latest/administer/windows/use-integrated-windows-authentication-with-your-portal.htm" target="_blank" rel="noopener">More info</a>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            </div>
                            <div className="modal-footer">
                                <button id="portalCancelBtn" className="btn btn-default" aria-hidden="true" onClick={() => setShowPortalModal(false)}>Cancel</button>
                                <button id="portalLoginBtn" className="btn btn-primary">Log in</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Body