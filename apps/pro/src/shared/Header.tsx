/**
 * The old in-screen header (organisation switcher, theme button, the Today
 * strip) that legacy screens still render at their top. Inside the new shell
 * the top bar and route header carry the organisation, the account, the
 * appearance and the title, so this renders nothing; it is deleted with the
 * last legacy screen that imports it (CalendarScreen, PeopleScreen,
 * MoreScreen, MatchPicker).
 */
export function Header(props: { readonly showOperations?: boolean }) {
  void props;
  return null;
}
