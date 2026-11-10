export class ActionFormData {
  static shown = [];   // every form shown, for the tests
  titleText = ""; bodyText = ""; buttons = [];
  title(t) { this.titleText = t; return this; }
  body(t) { this.bodyText = t; return this; }
  button(t) { this.buttons.push(t); return this; }
  async show() { ActionFormData.shown.push(this); return { canceled: true }; }
}
