import { existsSync } from "fs";

class Profile {
  private _profileName?: string;
  private _profileEmail?: string;
  private _profileImage?: string;
  private _moviesDirectory?: string;
  private _tvshowsDirectory?: string;
  private _profileId: string;
  constructor(profileName?: string) {
    if (profileName) {
      this.profileName = profileName;
    }
  }

  private createProfileId() {}
  private checkEmail(){}
  public createProfile() {}

  public get profileName(): string | undefined {
    return this._profileName;
  }

  public set profileName(name: string) {
    if (name.length < 1 || name.length >= 25) {
      throw new Error(
        "Cannot set name. Must be at least 1 character and less than 25 characters."
      );
    }
    this._profileName = name;
  }

  public get profileImage(): string | undefined {
    return this._profileImage;
  }

  public get moviesDirectory(): string | undefined {
    return this._moviesDirectory;
  }

  public get tvshowsDirectory(): string | undefined {
    return this._tvshowsDirectory;
  }

  public setProfileImage(path: string) {
    if (!existsSync(path)) {
      throw new Error(`Image path does not exist: ${path}`);
    }
    this._profileImage = path;
  }

  public setMoviesDirectory(path: string) {
    if (!existsSync(path)) {
      throw new Error(`Movies directory does not exist: ${path}`);
    }
    this._moviesDirectory = path;
  }

  public setTvShowsDirectory(path: string) {
    if (!existsSync(path)) {
      throw new Error(`TV shows directory does not exist: ${path}`);
    }
    this._tvshowsDirectory = path;
  }
}
