


















































import { $inputRule, $prose } from "@milkdown/kit/utils";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";


export interface EmojiItem {

  shortcode: string;

  character: string;

  category: string;
}















export const emojiTable: EmojiItem[] = [

  { shortcode: "smile", character: "😄", category: "Smileys & emotion" },
  { shortcode: "smiley", character: "😃", category: "Smileys & emotion" },
  { shortcode: "grinning", character: "😀", category: "Smileys & emotion" },
  { shortcode: "grin", character: "😁", category: "Smileys & emotion" },
  { shortcode: "laughing", character: "😆", category: "Smileys & emotion" },
  { shortcode: "satisfied", character: "😆", category: "Smileys & emotion" },
  { shortcode: "sweat_smile", character: "😅", category: "Smileys & emotion" },
  { shortcode: "rofl", character: "🤣", category: "Smileys & emotion" },
  { shortcode: "joy", character: "😂", category: "Smileys & emotion" },
  { shortcode: "slightly_smiling_face", character: "🙂", category: "Smileys & emotion" },
  { shortcode: "upside_down_face", character: "🙃", category: "Smileys & emotion" },
  { shortcode: "wink", character: "😉", category: "Smileys & emotion" },
  { shortcode: "blush", character: "😊", category: "Smileys & emotion" },
  { shortcode: "innocent", character: "😇", category: "Smileys & emotion" },
  { shortcode: "smiling_face_with_three_hearts", character: "🥰", category: "Smileys & emotion" },
  { shortcode: "heart_eyes", character: "😍", category: "Smileys & emotion" },
  { shortcode: "star_struck", character: "🤩", category: "Smileys & emotion" },
  { shortcode: "kissing_heart", character: "😘", category: "Smileys & emotion" },
  { shortcode: "kissing", character: "😗", category: "Smileys & emotion" },
  { shortcode: "relaxed", character: "☺️", category: "Smileys & emotion" },
  { shortcode: "yum", character: "😋", category: "Smileys & emotion" },
  { shortcode: "stuck_out_tongue", character: "😛", category: "Smileys & emotion" },
  { shortcode: "stuck_out_tongue_winking_eye", character: "😜", category: "Smileys & emotion" },
  { shortcode: "zany_face", character: "🤪", category: "Smileys & emotion" },
  { shortcode: "money_mouth_face", character: "🤑", category: "Smileys & emotion" },
  { shortcode: "hugs", character: "🤗", category: "Smileys & emotion" },
  { shortcode: "hand_over_mouth", character: "🤭", category: "Smileys & emotion" },
  { shortcode: "shushing_face", character: "🤫", category: "Smileys & emotion" },
  { shortcode: "thinking", character: "🤔", category: "Smileys & emotion" },
  { shortcode: "zipper_mouth_face", character: "🤐", category: "Smileys & emotion" },
  { shortcode: "raised_eyebrow", character: "🤨", category: "Smileys & emotion" },
  { shortcode: "neutral_face", character: "😐", category: "Smileys & emotion" },
  { shortcode: "expressionless", character: "😑", category: "Smileys & emotion" },
  { shortcode: "no_mouth", character: "😶", category: "Smileys & emotion" },
  { shortcode: "smirk", character: "😏", category: "Smileys & emotion" },
  { shortcode: "unamused", character: "😒", category: "Smileys & emotion" },
  { shortcode: "roll_eyes", character: "🙄", category: "Smileys & emotion" },
  { shortcode: "grimacing", character: "😬", category: "Smileys & emotion" },
  { shortcode: "lying_face", character: "🤥", category: "Smileys & emotion" },
  { shortcode: "relieved", character: "😌", category: "Smileys & emotion" },
  { shortcode: "pensive", character: "😔", category: "Smileys & emotion" },
  { shortcode: "sleepy", character: "😪", category: "Smileys & emotion" },
  { shortcode: "sleeping", character: "😴", category: "Smileys & emotion" },
  { shortcode: "mask", character: "😷", category: "Smileys & emotion" },
  { shortcode: "face_with_thermometer", character: "🤒", category: "Smileys & emotion" },
  { shortcode: "face_with_head_bandage", character: "🤕", category: "Smileys & emotion" },
  { shortcode: "nauseated_face", character: "🤢", category: "Smileys & emotion" },
  { shortcode: "vomiting_face", character: "🤮", category: "Smileys & emotion" },
  { shortcode: "sneezing_face", character: "🤧", category: "Smileys & emotion" },
  { shortcode: "hot_face", character: "🥵", category: "Smileys & emotion" },
  { shortcode: "cold_face", character: "🥶", category: "Smileys & emotion" },
  { shortcode: "woozy_face", character: "🥴", category: "Smileys & emotion" },
  { shortcode: "dizzy_face", character: "😵", category: "Smileys & emotion" },
  { shortcode: "exploding_head", character: "🤯", category: "Smileys & emotion" },
  { shortcode: "cowboy_hat_face", character: "🤠", category: "Smileys & emotion" },
  { shortcode: "partying_face", character: "🥳", category: "Smileys & emotion" },
  { shortcode: "sunglasses", character: "😎", category: "Smileys & emotion" },
  { shortcode: "nerd_face", character: "🤓", category: "Smileys & emotion" },
  { shortcode: "monocle_face", character: "🧐", category: "Smileys & emotion" },
  { shortcode: "confused", character: "😕", category: "Smileys & emotion" },
  { shortcode: "worried", character: "😟", category: "Smileys & emotion" },
  { shortcode: "slightly_frowning_face", character: "🙁", category: "Smileys & emotion" },
  { shortcode: "frowning_face", character: "☹️", category: "Smileys & emotion" },
  { shortcode: "open_mouth", character: "😮", category: "Smileys & emotion" },
  { shortcode: "hushed", character: "😯", category: "Smileys & emotion" },
  { shortcode: "astonished", character: "😲", category: "Smileys & emotion" },
  { shortcode: "flushed", character: "😳", category: "Smileys & emotion" },
  { shortcode: "pleading_face", character: "🥺", category: "Smileys & emotion" },
  { shortcode: "frowning", character: "😦", category: "Smileys & emotion" },
  { shortcode: "anguished", character: "😧", category: "Smileys & emotion" },
  { shortcode: "fearful", character: "😨", category: "Smileys & emotion" },
  { shortcode: "cold_sweat", character: "😰", category: "Smileys & emotion" },
  { shortcode: "disappointed_relieved", character: "😥", category: "Smileys & emotion" },
  { shortcode: "cry", character: "😢", category: "Smileys & emotion" },
  { shortcode: "sob", character: "😭", category: "Smileys & emotion" },
  { shortcode: "scream", character: "😱", category: "Smileys & emotion" },
  { shortcode: "confounded", character: "😖", category: "Smileys & emotion" },
  { shortcode: "persevere", character: "😣", category: "Smileys & emotion" },
  { shortcode: "disappointed", character: "😞", category: "Smileys & emotion" },
  { shortcode: "sweat", character: "😓", category: "Smileys & emotion" },
  { shortcode: "weary", character: "😩", category: "Smileys & emotion" },
  { shortcode: "tired_face", character: "😫", category: "Smileys & emotion" },
  { shortcode: "yawning_face", character: "🥱", category: "Smileys & emotion" },
  { shortcode: "triumph", character: "😤", category: "Smileys & emotion" },
  { shortcode: "rage", character: "😡", category: "Smileys & emotion" },
  { shortcode: "angry", character: "😠", category: "Smileys & emotion" },
  { shortcode: "cursing_face", character: "🤬", category: "Smileys & emotion" },
  { shortcode: "smiling_imp", character: "😈", category: "Smileys & emotion" },
  { shortcode: "imp", character: "👿", category: "Smileys & emotion" },
  { shortcode: "skull", character: "💀", category: "Smileys & emotion" },
  { shortcode: "poop", character: "💩", category: "Smileys & emotion" },
  { shortcode: "clown_face", character: "🤡", category: "Smileys & emotion" },
  { shortcode: "ghost", character: "👻", category: "Smileys & emotion" },
  { shortcode: "alien", character: "👽", category: "Smileys & emotion" },
  { shortcode: "robot", character: "🤖", category: "Smileys & emotion" },
  { shortcode: "see_no_evil", character: "🙈", category: "Smileys & emotion" },
  { shortcode: "hear_no_evil", character: "🙉", category: "Smileys & emotion" },
  { shortcode: "speak_no_evil", character: "🙊", category: "Smileys & emotion" },
  { shortcode: "smiley_cat", character: "😺", category: "Smileys & emotion" },
  { shortcode: "smile_cat", character: "😸", category: "Smileys & emotion" },
  { shortcode: "heart_eyes_cat", character: "😻", category: "Smileys & emotion" },
  { shortcode: "crying_cat_face", character: "😿", category: "Smileys & emotion" },
  { shortcode: "pouting_cat", character: "😾", category: "Smileys & emotion" },


  { shortcode: "wave", character: "👋", category: "People & gestures" },
  { shortcode: "raised_hand", character: "✋", category: "People & gestures" },
  { shortcode: "raised_back_of_hand", character: "🤚", category: "People & gestures" },
  { shortcode: "vulcan_salute", character: "🖖", category: "People & gestures" },
  { shortcode: "ok_hand", character: "👌", category: "People & gestures" },
  { shortcode: "pinched_fingers", character: "🤌", category: "People & gestures" },
  { shortcode: "v", character: "✌️", category: "People & gestures" },
  { shortcode: "crossed_fingers", character: "🤞", category: "People & gestures" },
  { shortcode: "love_you_gesture", character: "🤟", category: "People & gestures" },
  { shortcode: "metal", character: "🤘", category: "People & gestures" },
  { shortcode: "call_me_hand", character: "🤙", category: "People & gestures" },
  { shortcode: "point_left", character: "👈", category: "People & gestures" },
  { shortcode: "point_right", character: "👉", category: "People & gestures" },
  { shortcode: "point_up_2", character: "👆", category: "People & gestures" },
  { shortcode: "point_down", character: "👇", category: "People & gestures" },
  { shortcode: "point_up", character: "☝️", category: "People & gestures" },
  { shortcode: "thumbsup", character: "👍", category: "People & gestures" },
  { shortcode: "+1", character: "👍", category: "People & gestures" },
  { shortcode: "thumbsdown", character: "👎", category: "People & gestures" },
  { shortcode: "-1", character: "👎", category: "People & gestures" },
  { shortcode: "fist_raised", character: "✊", category: "People & gestures" },
  { shortcode: "fist_oncoming", character: "👊", category: "People & gestures" },
  { shortcode: "fist_left", character: "🤛", category: "People & gestures" },
  { shortcode: "fist_right", character: "🤜", category: "People & gestures" },
  { shortcode: "clap", character: "👏", category: "People & gestures" },
  { shortcode: "raised_hands", character: "🙌", category: "People & gestures" },
  { shortcode: "open_hands", character: "👐", category: "People & gestures" },
  { shortcode: "palms_up_together", character: "🤲", category: "People & gestures" },
  { shortcode: "handshake", character: "🤝", category: "People & gestures" },
  { shortcode: "pray", character: "🙏", category: "People & gestures" },
  { shortcode: "writing_hand", character: "✍️", category: "People & gestures" },
  { shortcode: "nail_care", character: "💅", category: "People & gestures" },
  { shortcode: "muscle", character: "💪", category: "People & gestures" },
  { shortcode: "eyes", character: "👀", category: "People & gestures" },
  { shortcode: "eye", character: "👁️", category: "People & gestures" },
  { shortcode: "ear", character: "👂", category: "People & gestures" },
  { shortcode: "nose", character: "👃", category: "People & gestures" },
  { shortcode: "brain", character: "🧠", category: "People & gestures" },
  { shortcode: "tongue", character: "👅", category: "People & gestures" },
  { shortcode: "lips", character: "👄", category: "People & gestures" },
  { shortcode: "selfie", character: "🤳", category: "People & gestures" },
  { shortcode: "shrug", character: "🤷", category: "People & gestures" },
  { shortcode: "facepalm", character: "🤦", category: "People & gestures" },
  { shortcode: "bow", character: "🙇", category: "People & gestures" },
  { shortcode: "no_good", character: "🙅", category: "People & gestures" },
  { shortcode: "ok_woman", character: "🙆", category: "People & gestures" },
  { shortcode: "raising_hand", character: "🙋", category: "People & gestures" },


  { shortcode: "baby", character: "👶", category: "People" },
  { shortcode: "boy", character: "👦", category: "People" },
  { shortcode: "girl", character: "👧", category: "People" },
  { shortcode: "man", character: "👨", category: "People" },
  { shortcode: "woman", character: "👩", category: "People" },
  { shortcode: "older_man", character: "👴", category: "People" },
  { shortcode: "older_woman", character: "👵", category: "People" },
  { shortcode: "family", character: "👪", category: "People" },
  { shortcode: "couple", character: "👫", category: "People" },
  { shortcode: "two_men_holding_hands", character: "👬", category: "People" },
  { shortcode: "two_women_holding_hands", character: "👭", category: "People" },
  { shortcode: "dancer", character: "💃", category: "People" },
  { shortcode: "man_dancing", character: "🕺", category: "People" },
  { shortcode: "santa", character: "🎅", category: "People" },
  { shortcode: "snowman", character: "⛄", category: "People" },


  { shortcode: "dog", character: "🐶", category: "Animals & nature" },
  { shortcode: "cat", character: "🐱", category: "Animals & nature" },
  { shortcode: "mouse", character: "🐭", category: "Animals & nature" },
  { shortcode: "hamster", character: "🐹", category: "Animals & nature" },
  { shortcode: "rabbit", character: "🐰", category: "Animals & nature" },
  { shortcode: "fox_face", character: "🦊", category: "Animals & nature" },
  { shortcode: "bear", character: "🐻", category: "Animals & nature" },
  { shortcode: "panda_face", character: "🐼", category: "Animals & nature" },
  { shortcode: "koala", character: "🐨", category: "Animals & nature" },
  { shortcode: "tiger", character: "🐯", category: "Animals & nature" },
  { shortcode: "lion", character: "🦁", category: "Animals & nature" },
  { shortcode: "cow", character: "🐮", category: "Animals & nature" },
  { shortcode: "pig", character: "🐷", category: "Animals & nature" },
  { shortcode: "frog", character: "🐸", category: "Animals & nature" },
  { shortcode: "monkey_face", character: "🐵", category: "Animals & nature" },
  { shortcode: "chicken", character: "🐔", category: "Animals & nature" },
  { shortcode: "penguin", character: "🐧", category: "Animals & nature" },
  { shortcode: "bird", character: "🐦", category: "Animals & nature" },
  { shortcode: "baby_chick", character: "🐤", category: "Animals & nature" },
  { shortcode: "hatching_chick", character: "🐣", category: "Animals & nature" },
  { shortcode: "duck", character: "🦆", category: "Animals & nature" },
  { shortcode: "eagle", character: "🦅", category: "Animals & nature" },
  { shortcode: "owl", character: "🦉", category: "Animals & nature" },
  { shortcode: "bat", character: "🦇", category: "Animals & nature" },
  { shortcode: "wolf", character: "🐺", category: "Animals & nature" },
  { shortcode: "boar", character: "🐗", category: "Animals & nature" },
  { shortcode: "horse", character: "🐴", category: "Animals & nature" },
  { shortcode: "unicorn", character: "🦄", category: "Animals & nature" },
  { shortcode: "bee", character: "🐝", category: "Animals & nature" },
  { shortcode: "bug", character: "🐛", category: "Animals & nature" },
  { shortcode: "butterfly", character: "🦋", category: "Animals & nature" },
  { shortcode: "snail", character: "🐌", category: "Animals & nature" },
  { shortcode: "beetle", character: "🐞", category: "Animals & nature" },
  { shortcode: "ant", character: "🐜", category: "Animals & nature" },
  { shortcode: "spider", character: "🕷️", category: "Animals & nature" },
  { shortcode: "scorpion", character: "🦂", category: "Animals & nature" },
  { shortcode: "crab", character: "🦀", category: "Animals & nature" },
  { shortcode: "snake", character: "🐍", category: "Animals & nature" },
  { shortcode: "lizard", character: "🦎", category: "Animals & nature" },
  { shortcode: "turtle", character: "🐢", category: "Animals & nature" },
  { shortcode: "tropical_fish", character: "🐠", category: "Animals & nature" },
  { shortcode: "fish", character: "🐟", category: "Animals & nature" },
  { shortcode: "blowfish", character: "🐡", category: "Animals & nature" },
  { shortcode: "dolphin", character: "🐬", category: "Animals & nature" },
  { shortcode: "whale", character: "🐳", category: "Animals & nature" },
  { shortcode: "shark", character: "🦈", category: "Animals & nature" },
  { shortcode: "octopus", character: "🐙", category: "Animals & nature" },
  { shortcode: "shell", character: "🐚", category: "Animals & nature" },
  { shortcode: "dragon", character: "🐉", category: "Animals & nature" },
  { shortcode: "t_rex", character: "🦖", category: "Animals & nature" },
  { shortcode: "sauropod", character: "🦕", category: "Animals & nature" },


  { shortcode: "apple", character: "🍎", category: "Food & drink" },
  { shortcode: "green_apple", character: "🍏", category: "Food & drink" },
  { shortcode: "pear", character: "🍐", category: "Food & drink" },
  { shortcode: "tangerine", character: "🍊", category: "Food & drink" },
  { shortcode: "lemon", character: "🍋", category: "Food & drink" },
  { shortcode: "cherries", character: "🍒", category: "Food & drink" },
  { shortcode: "grapes", character: "🍇", category: "Food & drink" },
  { shortcode: "watermelon", character: "🍉", category: "Food & drink" },
  { shortcode: "strawberry", character: "🍓", category: "Food & drink" },
  { shortcode: "peach", character: "🍑", category: "Food & drink" },
  { shortcode: "melon", character: "🍈", category: "Food & drink" },
  { shortcode: "banana", character: "🍌", category: "Food & drink" },
  { shortcode: "pineapple", character: "🍍", category: "Food & drink" },
  { shortcode: "coconut", character: "🥥", category: "Food & drink" },
  { shortcode: "kiwi_fruit", character: "🥝", category: "Food & drink" },
  { shortcode: "tomato", character: "🍅", category: "Food & drink" },
  { shortcode: "avocado", character: "🥑", category: "Food & drink" },
  { shortcode: "eggplant", character: "🍆", category: "Food & drink" },
  { shortcode: "potato", character: "🥔", category: "Food & drink" },
  { shortcode: "carrot", character: "🥕", category: "Food & drink" },
  { shortcode: "corn", character: "🌽", category: "Food & drink" },
  { shortcode: "hot_pepper", character: "🌶️", category: "Food & drink" },
  { shortcode: "cucumber", character: "🥒", category: "Food & drink" },
  { shortcode: "mushroom", character: "🍄", category: "Food & drink" },
  { shortcode: "bread", character: "🍞", category: "Food & drink" },
  { shortcode: "croissant", character: "🥐", category: "Food & drink" },
  { shortcode: "baguette_bread", character: "🥖", category: "Food & drink" },
  { shortcode: "pancakes", character: "🥞", category: "Food & drink" },
  { shortcode: "cheese", character: "🧀", category: "Food & drink" },
  { shortcode: "meat_on_bone", character: "🍖", category: "Food & drink" },
  { shortcode: "poultry_leg", character: "🍗", category: "Food & drink" },
  { shortcode: "hamburger", character: "🍔", category: "Food & drink" },
  { shortcode: "fries", character: "🍟", category: "Food & drink" },
  { shortcode: "pizza", character: "🍕", category: "Food & drink" },
  { shortcode: "hotdog", character: "🌭", category: "Food & drink" },
  { shortcode: "sandwich", character: "🥪", category: "Food & drink" },
  { shortcode: "taco", character: "🌮", category: "Food & drink" },
  { shortcode: "burrito", character: "🌯", category: "Food & drink" },
  { shortcode: "egg", character: "🥚", category: "Food & drink" },
  { shortcode: "fried_egg", character: "🍳", category: "Food & drink" },
  { shortcode: "ramen", character: "🍜", category: "Food & drink" },
  { shortcode: "spaghetti", character: "🍝", category: "Food & drink" },
  { shortcode: "rice", character: "🍚", category: "Food & drink" },
  { shortcode: "curry", character: "🍛", category: "Food & drink" },
  { shortcode: "sushi", character: "🍣", category: "Food & drink" },
  { shortcode: "bento", character: "🍱", category: "Food & drink" },
  { shortcode: "dumpling", character: "🥟", category: "Food & drink" },
  { shortcode: "icecream", character: "🍦", category: "Food & drink" },
  { shortcode: "shaved_ice", character: "🍧", category: "Food & drink" },
  { shortcode: "cake", character: "🍰", category: "Food & drink" },
  { shortcode: "birthday", character: "🎂", category: "Food & drink" },
  { shortcode: "cupcake", character: "🧁", category: "Food & drink" },
  { shortcode: "pie", character: "🥧", category: "Food & drink" },
  { shortcode: "chocolate_bar", character: "🍫", category: "Food & drink" },
  { shortcode: "candy", character: "🍬", category: "Food & drink" },
  { shortcode: "lollipop", character: "🍭", category: "Food & drink" },
  { shortcode: "honey_pot", character: "🍯", category: "Food & drink" },
  { shortcode: "coffee", character: "☕", category: "Food & drink" },
  { shortcode: "tea", character: "🍵", category: "Food & drink" },
  { shortcode: "beer", character: "🍺", category: "Food & drink" },
  { shortcode: "beers", character: "🍻", category: "Food & drink" },
  { shortcode: "wine_glass", character: "🍷", category: "Food & drink" },
  { shortcode: "cocktail", character: "🍸", category: "Food & drink" },
  { shortcode: "tropical_drink", character: "🍹", category: "Food & drink" },
  { shortcode: "sake", character: "🍶", category: "Food & drink" },
  { shortcode: "milk_glass", character: "🥛", category: "Food & drink" },


  { shortcode: "soccer", character: "⚽", category: "Activities" },
  { shortcode: "basketball", character: "🏀", category: "Activities" },
  { shortcode: "football", character: "🏈", category: "Activities" },
  { shortcode: "baseball", character: "⚾", category: "Activities" },
  { shortcode: "tennis", character: "🎾", category: "Activities" },
  { shortcode: "volleyball", character: "🏐", category: "Activities" },
  { shortcode: "rugby_football", character: "🏉", category: "Activities" },
  { shortcode: "golf", character: "⛳", category: "Activities" },
  { shortcode: "ski", character: "🎿", category: "Activities" },
  { shortcode: "ice_skate", character: "⛸️", category: "Activities" },
  { shortcode: "dart", character: "🎯", category: "Activities" },
  { shortcode: "8ball", character: "🎱", category: "Activities" },
  { shortcode: "bowling", character: "🎳", category: "Activities" },
  { shortcode: "video_game", character: "🎮", category: "Activities" },
  { shortcode: "game_die", character: "🎲", category: "Activities" },
  { shortcode: "chess_pawn", character: "♟️", category: "Activities" },
  { shortcode: "performing_arts", character: "🎭", category: "Activities" },
  { shortcode: "art", character: "🎨", category: "Activities" },
  { shortcode: "musical_note", character: "🎵", category: "Activities" },
  { shortcode: "notes", character: "🎶", category: "Activities" },
  { shortcode: "trophy", character: "🏆", category: "Activities" },
  { shortcode: "medal_sports", character: "🏅", category: "Activities" },
  { shortcode: "first_place_medal", character: "🥇", category: "Activities" },
  { shortcode: "second_place_medal", character: "🥈", category: "Activities" },
  { shortcode: "third_place_medal", character: "🥉", category: "Activities" },
  { shortcode: "ticket", character: "🎫", category: "Activities" },
  { shortcode: "tickets", character: "🎟️", category: "Activities" },
  { shortcode: "gift", character: "🎁", category: "Activities" },
  { shortcode: "balloon", character: "🎈", category: "Activities" },
  { shortcode: "tada", character: "🎉", category: "Activities" },
  { shortcode: "confetti_ball", character: "🎊", category: "Activities" },
  { shortcode: "sparkles", character: "✨", category: "Activities" },
  { shortcode: "firecracker", character: "🧨", category: "Activities" },
  { shortcode: "crystal_ball", character: "🔮", category: "Activities" },


  { shortcode: "car", character: "🚗", category: "Travel & places" },
  { shortcode: "taxi", character: "🚕", category: "Travel & places" },
  { shortcode: "bus", character: "🚌", category: "Travel & places" },
  { shortcode: "minibus", character: "🚐", category: "Travel & places" },
  { shortcode: "police_car", character: "🚓", category: "Travel & places" },
  { shortcode: "ambulance", character: "🚑", category: "Travel & places" },
  { shortcode: "fire_engine", character: "🚒", category: "Travel & places" },
  { shortcode: "truck", character: "🚚", category: "Travel & places" },
  { shortcode: "bicycle", character: "🚲", category: "Travel & places" },
  { shortcode: "motor_scooter", character: "🛵", category: "Travel & places" },
  { shortcode: "motorcycle", character: "🏍️", category: "Travel & places" },
  { shortcode: "train", character: "🚆", category: "Travel & places" },
  { shortcode: "bullettrain_side", character: "🚄", category: "Travel & places" },
  { shortcode: "airplane", character: "✈️", category: "Travel & places" },
  { shortcode: "small_airplane", character: "🛩️", category: "Travel & places" },
  { shortcode: "rocket", character: "🚀", category: "Travel & places" },
  { shortcode: "helicopter", character: "🚁", category: "Travel & places" },
  { shortcode: "sailboat", character: "⛵", category: "Travel & places" },
  { shortcode: "speedboat", character: "🚤", category: "Travel & places" },
  { shortcode: "ship", character: "🚢", category: "Travel & places" },
  { shortcode: "anchor", character: "⚓", category: "Travel & places" },
  { shortcode: "fuelpump", character: "⛽", category: "Travel & places" },
  { shortcode: "traffic_light", character: "🚦", category: "Travel & places" },
  { shortcode: "construction", character: "🚧", category: "Travel & places" },
  { shortcode: "house", character: "🏠", category: "Travel & places" },
  { shortcode: "office", character: "🏢", category: "Travel & places" },
  { shortcode: "hospital", character: "🏥", category: "Travel & places" },
  { shortcode: "bank", character: "🏦", category: "Travel & places" },
  { shortcode: "hotel", character: "🏨", category: "Travel & places" },
  { shortcode: "school", character: "🏫", category: "Travel & places" },
  { shortcode: "church", character: "⛪", category: "Travel & places" },
  { shortcode: "tent", character: "⛺", category: "Travel & places" },
  { shortcode: "castle", character: "🏰", category: "Travel & places" },
  { shortcode: "statue_of_liberty", character: "🗽", category: "Travel & places" },
  { shortcode: "mount_fuji", character: "🗻", category: "Travel & places" },


  { shortcode: "sunny", character: "☀️", category: "Nature" },
  { shortcode: "moon", character: "🌙", category: "Nature" },
  { shortcode: "star", character: "⭐", category: "Nature" },
  { shortcode: "star2", character: "🌟", category: "Nature" },
  { shortcode: "sunrise", character: "🌅", category: "Nature" },
  { shortcode: "rainbow", character: "🌈", category: "Nature" },
  { shortcode: "cloud", character: "☁️", category: "Nature" },
  { shortcode: "snowflake", character: "❄️", category: "Nature" },
  { shortcode: "zap", character: "⚡", category: "Nature" },
  { shortcode: "fire", character: "🔥", category: "Nature" },
  { shortcode: "ocean", character: "🌊", category: "Nature" },
  { shortcode: "earth_asia", character: "🌏", category: "Nature" },
  { shortcode: "globe_with_meridians", character: "🌐", category: "Nature" },
  { shortcode: "cactus", character: "🌵", category: "Nature" },
  { shortcode: "four_leaf_clover", character: "🍀", category: "Nature" },
  { shortcode: "maple_leaf", character: "🍁", category: "Nature" },
  { shortcode: "fallen_leaf", character: "🍂", category: "Nature" },
  { shortcode: "herb", character: "🌿", category: "Nature" },
  { shortcode: "rose", character: "🌹", category: "Nature" },
  { shortcode: "sunflower", character: "🌻", category: "Nature" },
  { shortcode: "tulip", character: "🌷", category: "Nature" },
  { shortcode: "cherry_blossom", character: "🌸", category: "Nature" },


  { shortcode: "watch", character: "⌚", category: "Objects" },
  { shortcode: "iphone", character: "📱", category: "Objects" },
  { shortcode: "computer", character: "💻", category: "Objects" },
  { shortcode: "desktop_computer", character: "🖥️", category: "Objects" },
  { shortcode: "keyboard", character: "⌨️", category: "Objects" },
  { shortcode: "printer", character: "🖨️", category: "Objects" },
  { shortcode: "computer_mouse", character: "🖱️", category: "Objects" },
  { shortcode: "floppy_disk", character: "💾", category: "Objects" },
  { shortcode: "cd", character: "💿", category: "Objects" },
  { shortcode: "dvd", character: "📀", category: "Objects" },
  { shortcode: "battery", character: "🔋", category: "Objects" },
  { shortcode: "electric_plug", character: "🔌", category: "Objects" },
  { shortcode: "bulb", character: "💡", category: "Objects" },
  { shortcode: "flashlight", character: "🔦", category: "Objects" },
  { shortcode: "camera", character: "📷", category: "Objects" },
  { shortcode: "video_camera", character: "📹", category: "Objects" },
  { shortcode: "movie_camera", character: "🎥", category: "Objects" },
  { shortcode: "phone", character: "☎️", category: "Objects" },
  { shortcode: "telephone_receiver", character: "📞", category: "Objects" },
  { shortcode: "tv", character: "📺", category: "Objects" },
  { shortcode: "radio", character: "📻", category: "Objects" },
  { shortcode: "bell", character: "🔔", category: "Objects" },
  { shortcode: "no_bell", character: "🔕", category: "Objects" },
  { shortcode: "loud_sound", character: "🔊", category: "Objects" },
  { shortcode: "mute", character: "🔇", category: "Objects" },
  { shortcode: "mega", character: "📣", category: "Objects" },
  { shortcode: "hourglass", character: "⌛", category: "Objects" },
  { shortcode: "alarm_clock", character: "⏰", category: "Objects" },
  { shortcode: "lock", character: "🔒", category: "Objects" },
  { shortcode: "unlock", character: "🔓", category: "Objects" },
  { shortcode: "key", character: "🔑", category: "Objects" },
  { shortcode: "hammer", character: "🔨", category: "Objects" },
  { shortcode: "wrench", character: "🔧", category: "Objects" },
  { shortcode: "nut_and_bolt", character: "🔩", category: "Objects" },
  { shortcode: "gear", character: "⚙️", category: "Objects" },
  { shortcode: "link", character: "🔗", category: "Objects" },
  { shortcode: "paperclip", character: "📎", category: "Objects" },
  { shortcode: "scissors", character: "✂️", category: "Objects" },
  { shortcode: "pencil2", character: "✏️", category: "Objects" },
  { shortcode: "pen", character: "🖊️", category: "Objects" },
  { shortcode: "fountain_pen", character: "🖋️", category: "Objects" },
  { shortcode: "memo", character: "📝", category: "Objects" },
  { shortcode: "books", character: "📚", category: "Objects" },
  { shortcode: "book", character: "📖", category: "Objects" },
  { shortcode: "newspaper", character: "📰", category: "Objects" },
  { shortcode: "bookmark", character: "🔖", category: "Objects" },
  { shortcode: "email", character: "📧", category: "Objects" },
  { shortcode: "envelope", character: "✉️", category: "Objects" },
  { shortcode: "inbox_tray", character: "📥", category: "Objects" },
  { shortcode: "outbox_tray", character: "📤", category: "Objects" },
  { shortcode: "package", character: "📦", category: "Objects" },
  { shortcode: "mailbox", character: "📫", category: "Objects" },
  { shortcode: "chart_with_upwards_trend", character: "📈", category: "Objects" },
  { shortcode: "chart_with_downwards_trend", character: "📉", category: "Objects" },
  { shortcode: "bar_chart", character: "📊", category: "Objects" },
  { shortcode: "clipboard", character: "📋", category: "Objects" },
  { shortcode: "calendar", character: "📅", category: "Objects" },
  { shortcode: "pushpin", character: "📌", category: "Objects" },
  { shortcode: "round_pushpin", character: "📍", category: "Objects" },
  { shortcode: "triangular_ruler", character: "📐", category: "Objects" },
  { shortcode: "straight_ruler", character: "📏", category: "Objects" },
  { shortcode: "mag", character: "🔍", category: "Objects" },
  { shortcode: "mag_right", character: "🔎", category: "Objects" },
  { shortcode: "moneybag", character: "💰", category: "Objects" },
  { shortcode: "dollar", character: "💵", category: "Objects" },
  { shortcode: "credit_card", character: "💳", category: "Objects" },
  { shortcode: "gem", character: "💎", category: "Objects" },
  { shortcode: "shield", character: "🛡️", category: "Objects" },
  { shortcode: "wastebasket", character: "🗑️", category: "Objects" },


  { shortcode: "heart", character: "❤️", category: "Symbols" },
  { shortcode: "orange_heart", character: "🧡", category: "Symbols" },
  { shortcode: "yellow_heart", character: "💛", category: "Symbols" },
  { shortcode: "green_heart", character: "💚", category: "Symbols" },
  { shortcode: "blue_heart", character: "💙", category: "Symbols" },
  { shortcode: "purple_heart", character: "💜", category: "Symbols" },
  { shortcode: "black_heart", character: "🖤", category: "Symbols" },
  { shortcode: "white_heart", character: "🤍", category: "Symbols" },
  { shortcode: "brown_heart", character: "🤎", category: "Symbols" },
  { shortcode: "broken_heart", character: "💔", category: "Symbols" },
  { shortcode: "two_hearts", character: "💕", category: "Symbols" },
  { shortcode: "sparkling_heart", character: "💖", category: "Symbols" },
  { shortcode: "heartpulse", character: "💗", category: "Symbols" },
  { shortcode: "heartbeat", character: "💓", category: "Symbols" },
  { shortcode: "revolving_hearts", character: "💞", category: "Symbols" },
  { shortcode: "cupid", character: "💘", category: "Symbols" },
  { shortcode: "gift_heart", character: "💝", category: "Symbols" },
  { shortcode: "100", character: "💯", category: "Symbols" },
  { shortcode: "anger", character: "💢", category: "Symbols" },
  { shortcode: "boom", character: "💥", category: "Symbols" },
  { shortcode: "dizzy", character: "💫", category: "Symbols" },
  { shortcode: "sweat_drops", character: "💦", category: "Symbols" },
  { shortcode: "dash", character: "💨", category: "Symbols" },
  { shortcode: "speech_balloon", character: "💬", category: "Symbols" },
  { shortcode: "thought_balloon", character: "💭", category: "Symbols" },
  { shortcode: "zzz", character: "💤", category: "Symbols" },
  { shortcode: "white_check_mark", character: "✅", category: "Symbols" },
  { shortcode: "x", character: "❌", category: "Symbols" },
  { shortcode: "heavy_check_mark", character: "✔️", category: "Symbols" },
  { shortcode: "heavy_multiplication_x", character: "✖️", category: "Symbols" },
  { shortcode: "bangbang", character: "‼️", category: "Symbols" },
  { shortcode: "question", character: "❓", category: "Symbols" },
  { shortcode: "exclamation", character: "❗", category: "Symbols" },
  { shortcode: "warning", character: "⚠️", category: "Symbols" },
  { shortcode: "no_entry", character: "⛔", category: "Symbols" },
  { shortcode: "recycle", character: "♻️", category: "Symbols" },
  { shortcode: "arrow_up", character: "⬆️", category: "Symbols" },
  { shortcode: "arrow_down", character: "⬇️", category: "Symbols" },
  { shortcode: "arrow_left", character: "⬅️", category: "Symbols" },
  { shortcode: "arrow_right", character: "➡️", category: "Symbols" },
  { shortcode: "arrows_clockwise", character: "🔃", category: "Symbols" },
  { shortcode: "repeat", character: "🔁", category: "Symbols" },
  { shortcode: "infinity", character: "♾️", category: "Symbols" },
  { shortcode: "yin_yang", character: "☯️", category: "Symbols" },
  { shortcode: "trident", character: "🔱", category: "Symbols" },
  { shortcode: "atom_symbol", character: "⚛️", category: "Symbols" },
  { shortcode: "fleur_de_lis", character: "⚜️", category: "Symbols" },
  { shortcode: "hash", character: "#️⃣", category: "Symbols" },
  { shortcode: "asterisk", character: "*️⃣", category: "Symbols" },


  { shortcode: "checkered_flag", character: "🏁", category: "Flags" },
  { shortcode: "triangular_flag_on_post", character: "🚩", category: "Flags" },
  { shortcode: "cn", character: "🇨🇳", category: "Flags" },
  { shortcode: "us", character: "🇺🇸", category: "Flags" },
  { shortcode: "jp", character: "🇯🇵", category: "Flags" },
  { shortcode: "kr", character: "🇰🇷", category: "Flags" },
  { shortcode: "gb", character: "🇬🇧", category: "Flags" },
  { shortcode: "de", character: "🇩🇪", category: "Flags" },
  { shortcode: "fr", character: "🇫🇷", category: "Flags" },
  { shortcode: "es", character: "🇪🇸", category: "Flags" },
  { shortcode: "it", character: "🇮🇹", category: "Flags" },
  { shortcode: "ru", character: "🇷🇺", category: "Flags" },
];


export const emojiCategory: string[] = [...new Set(emojiTable.map((item5) => item5.category))];





const pressShortcode = new Map<string, EmojiItem>();
for (const item5 of emojiTable) {
  if (!pressShortcode.has(item5.shortcode)) pressShortcode.set(item5.shortcode, item5);
}


export function checkShortcode(shortcode: string): EmojiItem | null {
  return pressShortcode.get(shortcode.toLowerCase()) ?? null;
}










export function findEmoji(prefix: string, limit = 8): EmojiItem[] {
  const small = prefix.toLowerCase();
  const output2: EmojiItem[] = [];
  for (const item5 of emojiTable) {
    if (item5.shortcode.startsWith(small)) {
      output2.push(item5);
      if (output2.length >= limit) break;
    }
  }
  return output2;
}


export function withEmergeNumber(shortcode: string): string {
  return `:${shortcode}:`;
}








const ruleRuleOption = { inCodeMark: false } as const;









export const inputRuleRuleCorrectRule = /:([a-zA-Z0-9_+-]{1,}):[ \t]$/;














export function emojiInputRuleRule(open2: boolean) {
  if (!open2) return [];
  return [
    $inputRule(() =>
      new InputRule(inputRuleRuleCorrectRule, (state, match2, start6, end3) => {
        const item5 = checkShortcode(match2[1]!);
        if (!item5) return null;


        return state.tr.insertText(item5.character, start6, end3 - 1);
      }, ruleRuleOption),
    ),
  ];
}




export const emojiFillAllKey = new PluginKey<FillAllState | null>("notaEmoji");


export interface FillAllState {

  start5: number;

  prefix: string;

  candidate: EmojiItem[];

  selected: number;
}


const returnSee = 40;










export function recognizePrefix(state: EditorState): FillAllState | null {
  const select = state.selection;
  if (!select.empty) return null;
  const $from = select.$from;
  if (!$from.parent.isTextblock) return null;
  const start5 = Math.max(0, $from.parentOffset - returnSee);
  const prefixText = $from.parent.textBetween(start5, $from.parentOffset, undefined, "￼");
  const match2 = /:([a-zA-Z0-9_+-]{1,})$/.exec(prefixText);
  if (!match2) return null;
  const prefix = match2[1]!;
  const candidate = findEmoji(prefix);
  if (candidate.length === 0) return null;
  return {
    prefix,



    start5: $from.start() + start5 + match2.index,
    candidate,
    selected: 0,
  };
}








export function adoptUseCandidate(state: EditorState, state3: FillAllState, ordinalHowManyItem: number): Transaction | null {
  const item5 = state3.candidate[ordinalHowManyItem];
  if (!item5) return null;
  const to2 = state.selection.from;
  if (to2 < state3.start5) return null;
  return state.tr.insertText(item5.character, state3.start5, to2);
}












export function emojiFillAll(open2: boolean) {
  if (!open2) return [];
  return [
    $prose(() => {
      const panel = document.createElement("div");
      panel.className = "nota-emoji-pop";
      panel.setAttribute("role", "listbox");



      panel.contentEditable = "false";
      panel.hidden = true;
      document.body.appendChild(panel);


      let rendered: FillAllState | null = null;

      function collapse() {
        if (!panel.hidden) panel.hidden = true;
        rendered = null;
      }

      function arrangePosition(view: EditorView) {


        const coordinate = view.coordsAtPos(view.state.selection.from);

        const height = panel.offsetHeight;
        const below = coordinate.bottom + 4;
        const above = coordinate.top - height - 4;
        panel.style.left = `${Math.min(coordinate.left, window.innerWidth - panel.offsetWidth - 8)}px`;
        panel.style.top = `${below + height > window.innerHeight - 8 ? Math.max(8, above) : below}px`;
      }

      function draw(view: EditorView, state3: FillAllState) {

        if (rendered && rendered.start5 === state3.start5 && rendered.prefix === state3.prefix && rendered.selected === state3.selected) {
          arrangePosition(view);
          return;
        }
        panel.replaceChildren(
          ...state3.candidate.map((item5, i) => {
            const line3 = document.createElement("div");
            line3.className = "nota-emoji-item" + (i === state3.selected ? " is-on" : "");
            line3.setAttribute("role", "option");
            line3.setAttribute("aria-selected", String(i === state3.selected));
            const character2 = document.createElement("span");
            character2.className = "nota-emoji-glyph";
            character2.textContent = item5.character;
            const name3 = document.createElement("span");
            name3.className = "nota-emoji-name";
            name3.textContent = withEmergeNumber(item5.shortcode);
            line3.append(character2, name3);







            line3.addEventListener("mousedown", (e) => {
              e.preventDefault();
              const tr = adoptUseCandidate(view.state, state3, i);
              if (tr) view.dispatch(tr);
            });
            return line3;
          }),
        );
        panel.hidden = false;
        rendered = state3;
        arrangePosition(view);
      }

      return new Plugin<FillAllState | null>({
        key: emojiFillAllKey,

        state: {
          init: () => null,
          apply(tr, _OldValue, _OldValuestate, newValuestate) {





            const pointFixed = tr.getMeta(emojiFillAllKey) as FillAllState | null | undefined;
            if (pointFixed !== undefined) return pointFixed ?? null;



            return recognizePrefix(newValuestate);
          },
        },

        props: {
          handleKeyDown(view, event) {


            if (event.isComposing) return false;
            const state3 = emojiFillAllKey.getState(view.state);
            if (!state3) return false;
            switch (event.key) {
              case "ArrowDown":
                view.dispatch(
                  view.state.tr.setMeta(emojiFillAllKey, { ...state3, selected: (state3.selected + 1) % state3.candidate.length }),
                );
                return true;
              case "ArrowUp":
                view.dispatch(
                  view.state.tr.setMeta(emojiFillAllKey, {
                    ...state3,
                    selected: (state3.selected - 1 + state3.candidate.length) % state3.candidate.length,
                  }),
                );
                return true;
              case "Enter":
              case "Tab": {
                const tr = adoptUseCandidate(view.state, state3, state3.selected);
                if (!tr) return false;
                view.dispatch(tr);
                return true;
              }
              case "Escape":


                collapse();
                return true;
              default:
                return false;
            }
          },
        },

        view() {
          return {
            update(view) {
              const state3 = emojiFillAllKey.getState(view.state);
              if (state3) draw(view, state3);
              else collapse();
            },
            destroy() {
              panel.remove();
            },
          };
        },
      });
    }),
  ];
}
