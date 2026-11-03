export class ActionFormData {
  title() { return this; }
  button() { return this; }
  async show() { return { canceled: true }; }
}
