export class NotWhitelistedException {
  constructor() {
    this.message = 'You do not have permission to use this command.';
  }

  toString() {
    return this.message;
  }
}
