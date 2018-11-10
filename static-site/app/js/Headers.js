/*
* Based on https://github.com/ccoenraets/react-trivia
* Published under MIT license
*/

import React from 'react';

class Headers extends React.Component {

    render() {

        let style = {
                width: this.props.headerWidth
            },
            headers = [];

        this.props.data.forEach((category, index) => headers.push(<span className='header' style={style} key={index}>{category.category}</span>));

        return (
            <div className='headers'>
                {headers}
            </div>
        );
    }

};

export default Headers;
