import { Dropdown, Image, Modal, Button, Form, Tab, Tabs, Spinner, ListGroup, InputGroup } from "react-bootstrap";
import { useState, useEffect, useRef } from "react";

interface ProfileData {
  id: number;
  name: string;
  email: string | null;
  image_path: string | null;
  movies_directory: string | null;
  tvshows_directory: string | null;
}

interface BrowseResult {
  current: string;
  parent: string | null;
  directories: { name: string; path: string }[];
  files: { name: string; path: string }[];
}

function FileBrowser({ show, onHide, onSelect, initialPath, mode }: {
  show: boolean;
  onHide: () => void;
  onSelect: (path: string) => void;
  initialPath?: string;
  mode: "directories" | "images";
}) {
  const [browseData, setBrowseData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browseTo = (path: string) => {
    setLoading(true);
    setError(null);
    fetch(`/api/browse?path=${encodeURIComponent(path)}&mode=${mode}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setBrowseData(data);
        }
      })
      .catch(() => setError("Failed to browse"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (show) {
      browseTo(initialPath || "/");
    }
  }, [show]);

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{mode === "images" ? "Select Image" : "Browse Directories"}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {browseData && (
          <div className="mb-2">
            <strong className="text-truncate" style={{ fontSize: "0.9rem" }}>
              {browseData.current}
            </strong>
          </div>
        )}
        {error && <p className="text-danger">{error}</p>}
        {loading && <div className="text-center py-3"><Spinner animation="border" /></div>}
        {!loading && browseData && (
          <ListGroup style={{ maxHeight: "400px", overflowY: "auto" }}>
            {browseData.parent && (
              <ListGroup.Item
                action
                onClick={() => browseTo(browseData.parent!)}
                className="d-flex align-items-center gap-2"
              >
                <span>&#8592;</span> <span>..</span>
              </ListGroup.Item>
            )}
            {browseData.directories.map((dir) => (
              <ListGroup.Item
                key={dir.path}
                action
                onClick={() => browseTo(dir.path)}
                className="d-flex align-items-center gap-2"
              >
                <span>&#128193;</span> {dir.name}
              </ListGroup.Item>
            ))}
            {browseData.files.map((file) => (
              <ListGroup.Item
                key={file.path}
                action
                onClick={() => { onSelect(file.path); onHide(); }}
                className="d-flex align-items-center gap-2"
              >
                <span>&#128444;</span> {file.name}
              </ListGroup.Item>
            ))}
            {browseData.directories.length === 0 && browseData.files.length === 0 && (
              <ListGroup.Item className="text-muted">Empty directory</ListGroup.Item>
            )}
          </ListGroup>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        {mode === "directories" && (
          <Button
            variant="primary"
            disabled={!browseData}
            onClick={() => {
              if (browseData) {
                onSelect(browseData.current);
                onHide();
              }
            }}
          >
            Select This Directory
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

function ProfileModal({ show, onHide, profile, onProfileUpdate }: {
  show: boolean;
  onHide: () => void;
  profile: ProfileData;
  onProfileUpdate: (profile: ProfileData) => void;
}) {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email ?? "");
  const [showImageBrowser, setShowImageBrowser] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (show) {
      setName(profile.name);
      setEmail(profile.email ?? "");
    }
  }, [show, profile]);

  const handleSave = () => {
    fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email: email || null }),
    })
      .then((res) => res.json())
      .then((data) => { onProfileUpdate(data); onHide(); })
      .catch((err) => console.error("Failed to save profile:", err));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("avatar", file);
    fetch("/api/profile/avatar", { method: "POST", body: formData })
      .then((res) => res.json())
      .then((data) => { if (!data.error) onProfileUpdate(data); })
      .catch((err) => console.error("Upload failed:", err))
      .finally(() => setUploading(false));
  };

  const handleBrowseSelect = (filePath: string) => {
    setUploading(true);
    fetch("/api/profile/avatar/browse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    })
      .then((res) => res.json())
      .then((data) => { if (!data.error) onProfileUpdate(data); })
      .catch((err) => console.error("Browse select failed:", err))
      .finally(() => setUploading(false));
  };

  return (
    <>
      <Modal show={show} onHide={onHide} centered>
        <Modal.Header closeButton>
          <Modal.Title>Profile</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-center mb-3">
            <div className="position-relative d-inline-block">
              {uploading ? (
                <div style={{ width: 80, height: 80 }} className="d-flex align-items-center justify-content-center">
                  <Spinner animation="border" />
                </div>
              ) : (
                <Image
                  src={profile.image_path || "/images/profileicon.png"}
                  roundedCircle
                  width={80}
                  height={80}
                  style={{ objectFit: "cover", cursor: "pointer" }}
                  onClick={() => fileInputRef.current?.click()}
                />
              )}
            </div>
            <div className="mt-2 d-flex justify-content-center gap-2">
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                Upload
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setShowImageBrowser(true)}
                disabled={uploading}
              >
                Browse
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="d-none"
                onChange={handleFileUpload}
              />
            </div>
          </div>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Name</Form.Label>
              <Form.Control
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={25}
                isInvalid={name.length < 1}
              />
              <Form.Control.Feedback type="invalid">
                Name is required (1-25 characters)
              </Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Optional"
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={name.length < 1}>Save</Button>
        </Modal.Footer>
      </Modal>

      <FileBrowser
        show={showImageBrowser}
        onHide={() => setShowImageBrowser(false)}
        onSelect={handleBrowseSelect}
        initialPath="/"
        mode="images"
      />
    </>
  );
}

function SettingsModal({ show, onHide, profile, onProfileUpdate }: {
  show: boolean;
  onHide: () => void;
  profile: ProfileData;
  onProfileUpdate: (profile: ProfileData) => void;
}) {
  const [moviesDir, setMoviesDir] = useState(profile.movies_directory ?? "");
  const [tvshowsDir, setTvshowsDir] = useState(profile.tvshows_directory ?? "");
  const [browseTarget, setBrowseTarget] = useState<"movies" | "tvshows" | null>(null);

  useEffect(() => {
    if (show) {
      setMoviesDir(profile.movies_directory ?? "");
      setTvshowsDir(profile.tvshows_directory ?? "");
    }
  }, [show, profile]);

  const handleSave = () => {
    fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        movies_directory: moviesDir || null,
        tvshows_directory: tvshowsDir || null,
      }),
    })
      .then((res) => res.json())
      .then((data) => { onProfileUpdate(data); onHide(); })
      .catch((err) => console.error("Failed to save settings:", err));
  };

  const handleBrowseSelect = (path: string) => {
    if (browseTarget === "movies") {
      setMoviesDir(path);
    } else if (browseTarget === "tvshows") {
      setTvshowsDir(path);
    }
  };

  return (
    <>
      <Modal show={show} onHide={onHide} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Settings</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Tabs defaultActiveKey="directories" className="mb-3">
            <Tab eventKey="directories" title="Media Directories">
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label>Movies Directory</Form.Label>
                  <InputGroup>
                    <Form.Control
                      type="text"
                      value={moviesDir}
                      onChange={(e) => setMoviesDir(e.target.value)}
                      placeholder="e.g. /path/to/movies"
                    />
                    <Button
                      variant="outline-secondary"
                      onClick={() => setBrowseTarget("movies")}
                    >
                      Browse
                    </Button>
                  </InputGroup>
                  <Form.Text className="text-muted">
                    Path to the folder containing your movie directories
                  </Form.Text>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>TV Shows Directory</Form.Label>
                  <InputGroup>
                    <Form.Control
                      type="text"
                      value={tvshowsDir}
                      onChange={(e) => setTvshowsDir(e.target.value)}
                      placeholder="e.g. /path/to/tvshows"
                    />
                    <Button
                      variant="outline-secondary"
                      onClick={() => setBrowseTarget("tvshows")}
                    >
                      Browse
                    </Button>
                  </InputGroup>
                  <Form.Text className="text-muted">
                    Path to the folder containing your TV show directories
                  </Form.Text>
                </Form.Group>
              </Form>
            </Tab>
            <Tab eventKey="about" title="About">
              <p className="mb-1"><strong>OSSFlix</strong></p>
              <p className="text-muted">Open-source media browser and player.</p>
            </Tab>
          </Tabs>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>Save</Button>
        </Modal.Footer>
      </Modal>

      <FileBrowser
        show={browseTarget !== null}
        onHide={() => setBrowseTarget(null)}
        onSelect={handleBrowseSelect}
        initialPath={browseTarget === "movies" ? (moviesDir || "/") : (tvshowsDir || "/")}
        mode="directories"
      />
    </>
  );
}

export function Profile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => res.json())
      .then((data) => setProfile(data))
      .catch((err) => console.error("Failed to load profile:", err));
  }, []);

  if (!profile) {
    return <Spinner animation="border" size="sm" />;
  }

  return (
    <>
      <Dropdown align="end">
        <Dropdown.Toggle variant="link" className="d-flex align-items-center gap-2 text-decoration-none p-0">
          <Image
            src={profile.image_path || "/images/profileicon.png"}
            roundedCircle
            width={32}
            height={32}
            style={{ objectFit: "cover" }}
          />
          <span>{profile.name}</span>
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Item onClick={() => setShowProfile(true)}>Profile</Dropdown.Item>
          <Dropdown.Item onClick={() => setShowSettings(true)}>Settings</Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item>Sign Out</Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      <ProfileModal
        show={showProfile}
        onHide={() => setShowProfile(false)}
        profile={profile}
        onProfileUpdate={setProfile}
      />
      <SettingsModal
        show={showSettings}
        onHide={() => setShowSettings(false)}
        profile={profile}
        onProfileUpdate={setProfile}
      />
    </>
  );
}

export default Profile;
